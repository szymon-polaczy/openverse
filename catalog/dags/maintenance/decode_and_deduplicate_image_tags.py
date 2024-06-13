"""
See the issue for context and motivation: https://github.com/WordPress/openverse/issues/4452

This DAG triggers a run of the batched update DAG. It generates a new list of tags by
trimming all existing tags and re-inserting only the distinct tags of the resulting list of tags.

Only records before the CC Search -> Openverse transition are affected. As such, because all
audio records are dated aftter that transition, we only need to scan images.
"""

from datetime import datetime, timedelta
from pathlib import Path
from textwrap import dedent

from airflow.decorators import dag, task
from airflow.models.abstractoperator import AbstractOperator
from airflow.operators.trigger_dagrun import TriggerDagRunOperator

from common.constants import DAG_DEFAULT_ARGS, MEDIA_TYPES, POSTGRES_CONN_ID
from common.sql import PostgresHook
from database.batched_update.constants import DAG_ID as BATCHED_UPDATE_DAG_ID


DAG_ID = "decode_and_deduplicate_image_tags"

HAS_RAW_ESCAPED_UNICODE = r'(@.name like_regex "\\(x)([\da-f]{2})|\\(u)([\da-f]{4})" flag "i")'

# Add testing data
"""
UPDATE image
SET tags = tags || '[{"name": "ciudaddelassiencias", "provider": "flickr"}, {"name": "muséo", "provider": "flickr"}, {"name": "muséo", "provider": "recognition", "accuracy": 0.96}, {"name": "uploaded by me", "provider": "flickr"}, {}, {"name": "unknown", "provider": "recognition", "accuracy": 0.86}, {"name": "mus\\xe9o", "provider": "flickr"}, {"name": "mus\\u00e9o", "provider": "flickr"}, {"name": "musu00e9o", "provider": "flickr"}, {"name": "mus\\u00e9o", "provider": "flickr"}, {"name": "mus\\u00E9o", "provider": "flickr"}]'::jsonb
WHERE identifier IN (SELECT identifier FROM image WHERE provider = 'flickr' AND tags IS NOT NULL LIMIT 10);
"""

# Query data for matching
"""
select t from (select jsonb_path_query_array(
     tags,
     '$[*] ? (@.name like_regex "\\\\(x)([\\da-f]{2})|\\\\(u)([\\da-f]{4})" flag "i")
 "i")'
 ) t from image) as tt where jsonb_array_length(tt.t) > 0;
"""

# Clean up testing data
"""
UPDATE image SET tags = jsonb_path_query_array(
    tags,
    '$[*] ? (!(@.name like_regex "\\\\(x)([\\da-f]{2})|\\\\(u)([\\da-f]{4})" flag "i"))'
);
"""


@task
def ensure_ov_unistr(
    postgres_conn_id: str = POSTGRES_CONN_ID,
    task: AbstractOperator = None,
):
    """
    Create a naïve implementation of Postgres 14+ ``unistr``.

    We are on Postgres 13 and have to do without ``unistr``. For all intents and purposes,
    this implementation solves the problem for us.

    The ``ov`` prefix prevents clashing with the built-in should we upgrade.
    """

    postgres = PostgresHook(
        postgres_conn_id=postgres_conn_id,
        default_statement_timeout=PostgresHook.get_execution_timeout(task),
        log_sql=True,
    )

    return postgres.run(
        dedent(
            """
            CREATE OR REPLACE FUNCTION ov_unistr (string text)
                RETURNS text
            AS $$
                return string.encode().decode("unicode_escape")
            $$ LANGUAGE plpython3u;
            """
        )
    )


@task
def trigger_batched_update(**context):
    return TriggerDagRunOperator(
        task_id=DAG_ID,
        trigger_dag_id=BATCHED_UPDATE_DAG_ID,
        wait_for_completion=True,
        execution_timeout=timedelta(hours=5),
        retries=0,
        conf={
            "query_id": DAG_ID,
            "table_name": "image",
            # jsonb_path_query_first will return null if the first argument is null,
            # and so is safe for tagless works
            "select_query": dedent(
                """
                WHERE jsonb_path_query_first(
                    image.tags,
                    '$[*] ? {HAS_RAW_ESCAPED_UNICODE}'
                ) IS NOT NULL
                """
            ).strip(),
            "update_query": dedent(
                """
                SET updated_on = now(),
                tags = (
                    SELECT
                        jsonb_agg(
                            jsonb_set(
                                decoded.tag,
                                '{name}',
                                decoded.fixed_name
                            )
                        )
                    FROM (
                        SELECT DISTINCT ON (fixed_name, tag->'provider')
                            to_jsonb(ov_unistr(tag->>'name')) fixed_name,
                            tag
                        FROM jsonb_array_elements(image.tags || '[]'::jsonb) tag
                    ) decoded
                )
                """
            ).strip(),
            "dry_run": False,
        },
    ).execute(**context)


@dag(
    dag_id=DAG_ID,
    schedule=None,
    start_date=datetime(2024, 6, 3),
    tags=["database"],
    doc_md=__doc__,
    max_active_runs=1,
    default_args=DAG_DEFAULT_ARGS,
)
def decode_and_deduplicate_image_tags():
    ensure_ov_unistr() >> trigger_batched_update()


decode_and_deduplicate_image_tags()
