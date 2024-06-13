import logging
from typing import TypedDict, Required
import json
from uuid import uuid4
import shlex
from datetime import datetime, UTC

import psycopg2
import pytest
from airflow.models import Variable
from airflow.utils.state import DagRunState, TaskInstanceState
from airflow.utils.types import DagRunType

from common.storage import columns as col
from database.batched_update import constants
from database.batched_update.batched_update import (
    get_expected_update_count,
    notify_slack,
    update_batches,
)
from tests.test_utils import sql
from maintenance.decode_and_deduplicate_image_tags import DAG_ID, ensure_ov_unistr, trigger_batched_update, decode_and_deduplicate_image_tags


class Tag(TypedDict, total=False):
    name: Required[str]
    provider: Required[str | None]
    accuracy: float | None


def _mktag(name: str, *, provider: str | None = None, accuracy: float | None = None) -> Tag:
    return {
        "name": name,
        "provider": provider,
    } | {"accuracy": accuracy} if accuracy is not None else {}


@pytest.fixture
def load_images(postgres):
    identifiers = []

    def impl(images: list[tuple[str, list[Tag]]]):
        run_id = str(uuid4())
        populated = [
            {
                col.IDENTIFIER.db_name: uuid4(),
                col.LICENSE.db_name: "by",
                col.UPDATED_ON.db_name: "NOW()",
                col.CREATED_ON.db_name: "NOW()",
                col.TITLE.db_name: title,
                col.TAGS.db_name: json.dumps(tags),
                col.FOREIGN_ID.db_name: f"{run_id}_{title}",
                col.DIRECT_URL.db_name: f"https://example.com/{run_id}_{title}.jpg",
                col.PROVIDER.db_name: "flickr",
            }
            for title, tags in images
        ]

        identifiers += [p[col.IDENTIFIER.db_name] for p in populated]

        sql.load_sample_data_into_image_table(
            "image", postgres, populated
        )
        return populated

    yield impl

    idents = ", ".join([shlex.quote(ident) for ident in identifiers])
    postgres.cursor.execute(
        f"DELETE FROM image WHERE identifier IN ({idents})"
    )
    postgres.connection.commit()


@pytest.fixture(autouse=True, scope="module")
def with_dags_enabled():
    ...


def run_dag_to_completion():
    dagrun = decode_and_deduplicate_image_tags.create_dagrun(
        state=DagRunState.RUNNING,
        execution_date=datetime.now(UTC),
        run_type=DagRunType.MANUAL,
    )
    tis = dagrun.get_task_instances()
    breakpoint()

    return dagrun


def test_ignores_unescaped(postgres, load_images):
    # Based on some real examples
    images = load_images(
        [
            (
                "Leucadendron",
                [
                    _mktag("Leucadendron", "flickr"),
                    _mktag("Leucadendron", "magical_computer_vision", 0.9),
                ]
            ),
            (
                "Diócesis de Toluca",
                [
                    _mktag("diu00f3cesisdetoluca", "flickr"),
                ],
            ),
            (
                "Arquidiócesis de Tulancingo",
                [
                    _mktag("arquidiócesisdetulancingo", "flickr"),
                    _mktag("arquidiu00f3cesisdetulancingo", "flickr"),
                ]
            )
        ]
    )

    run_dag_to_completion()


@pytest.mark.parametrize(
    "total_row_count",
    (
        # Simulate a 'normal' flow, where the total count is passed into
        # the task via XCOM after creating the table
        3,
        # Simulate a DagRun that is using `resume_update` to skip creating a
        # new table, so None is passed in from XCOM and we need to run a
        # `SELECT COUNT(*)` on the temp table
        None,
    ),
)
def test_get_expected_update_count(
    postgres_with_image_and_temp_table,
    image_table,
    temp_table,
    identifier,
    total_row_count,
):
    # Load sample data into the image table
    _load_sample_data_into_image_table(
        image_table,
        postgres_with_image_and_temp_table,
    )

    # Create the temp table with a query that will select all records
    select_query = f"WHERE title='{OLD_TITLE}'"
    create_temp_table_query = constants.CREATE_TEMP_TABLE_QUERY.format(
        temp_table_name=temp_table, table_name=image_table, select_query=select_query
    )
    postgres_with_image_and_temp_table.cursor.execute(create_temp_table_query)
    postgres_with_image_and_temp_table.connection.commit()

    total_count = get_expected_update_count.function(
        query_id=f"test_{identifier}", total_row_count=total_row_count, dry_run=False
    )

    assert total_count == 3


def test_update_batches(
    postgres_with_image_and_temp_table,
    image_table,
    temp_table,
    identifier,
    batch_start_var,
):
    # Load sample data into the image table
    _load_sample_data_into_image_table(
        image_table,
        postgres_with_image_and_temp_table,
    )

    # Create the temp table with a query that will select records A and B
    select_query = f"WHERE provider='{MATCHING_PROVIDER}'"
    create_temp_table_query = constants.CREATE_TEMP_TABLE_QUERY.format(
        temp_table_name=temp_table, table_name=image_table, select_query=select_query
    )
    postgres_with_image_and_temp_table.cursor.execute(create_temp_table_query)
    postgres_with_image_and_temp_table.connection.commit()

    # Test update query
    update_query = f"SET title='{NEW_TITLE}'"
    updated_count = update_batches.function(
        dry_run=False,
        query_id=f"test_{identifier}",
        table_name=image_table,
        total_row_count=2,
        batch_size=1,
        update_query=update_query,
        update_timeout=3600,
        batch_start_var=batch_start_var,
        postgres_conn_id=sql.POSTGRES_CONN_ID,
    )

    # Both records A and C should be updated
    assert updated_count == 2

    postgres_with_image_and_temp_table.cursor.execute(f"SELECT * FROM {image_table};")
    actual_rows = postgres_with_image_and_temp_table.cursor.fetchall()

    assert len(actual_rows) == 3
    # This is the row that did not match the initial select_query, and will
    # therefore not be updated regardless of whether it is a dry run
    assert actual_rows[0][sql.fid_idx] == FID_C
    assert actual_rows[0][sql.title_idx] == OLD_TITLE

    # These are the updated rows
    assert actual_rows[1][sql.fid_idx] == FID_A
    assert actual_rows[1][sql.title_idx] == NEW_TITLE
    assert actual_rows[2][sql.fid_idx] == FID_B
    assert actual_rows[2][sql.title_idx] == NEW_TITLE


def test_update_batches_dry_run(
    postgres_with_image_and_temp_table,
    image_table,
    temp_table,
    identifier,
    batch_start_var,
):
    # Load sample data into the image table
    _load_sample_data_into_image_table(
        image_table,
        postgres_with_image_and_temp_table,
    )

    # Create the temp table with a query that will select records A and B
    select_query = f"WHERE provider='{MATCHING_PROVIDER}'"
    create_temp_table_query = constants.CREATE_TEMP_TABLE_QUERY.format(
        temp_table_name=temp_table, table_name=image_table, select_query=select_query
    )
    postgres_with_image_and_temp_table.cursor.execute(create_temp_table_query)
    postgres_with_image_and_temp_table.connection.commit()

    # Test update query
    update_query = f"SET title='{NEW_TITLE}'"
    updated_count = update_batches.function(
        dry_run=True,
        query_id=f"test_{identifier}",
        table_name=image_table,
        total_row_count=2,
        batch_size=1,
        update_query=update_query,
        update_timeout=3600,
        batch_start_var=batch_start_var,
        postgres_conn_id=sql.POSTGRES_CONN_ID,
    )

    # No records should be updated
    assert updated_count == 0

    postgres_with_image_and_temp_table.cursor.execute(f"SELECT * FROM {image_table};")
    actual_rows = postgres_with_image_and_temp_table.cursor.fetchall()

    assert len(actual_rows) == 3
    for row in actual_rows:
        assert row[sql.title_idx] == OLD_TITLE


def test_update_batches_resuming_from_batch_start(
    postgres_with_image_and_temp_table,
    image_table,
    temp_table,
    identifier,
    batch_start_var,
):
    # Load sample data into the image table
    _load_sample_data_into_image_table(
        image_table,
        postgres_with_image_and_temp_table,
    )

    # Create the temp table with a query that will select all three records
    select_query = f"WHERE title='{OLD_TITLE}'"
    create_temp_table_query = constants.CREATE_TEMP_TABLE_QUERY.format(
        temp_table_name=temp_table, table_name=image_table, select_query=select_query
    )
    postgres_with_image_and_temp_table.cursor.execute(create_temp_table_query)
    postgres_with_image_and_temp_table.connection.commit()

    # Set the batch_start Airflow variable to 1, to skip the first
    # record
    Variable.set(batch_start_var, 1)

    update_query = f"SET title='{NEW_TITLE}'"
    updated_count = update_batches.function(
        dry_run=False,
        query_id=f"test_{identifier}",
        table_name=image_table,
        total_row_count=3,
        batch_size=1,
        update_query=update_query,
        update_timeout=3600,
        batch_start_var=batch_start_var,
        postgres_conn_id=sql.POSTGRES_CONN_ID,
    )

    # Only records B and C should have been updated
    assert updated_count == 2

    postgres_with_image_and_temp_table.cursor.execute(f"SELECT * FROM {image_table};")
    actual_rows = postgres_with_image_and_temp_table.cursor.fetchall()

    assert len(actual_rows) == 3
    # This is the first row, that was skipped by setting the batch_start to 1
    assert actual_rows[0][sql.fid_idx] == FID_A
    assert actual_rows[0][sql.title_idx] == OLD_TITLE

    # These are the updated rows
    assert actual_rows[1][sql.fid_idx] == FID_B
    assert actual_rows[1][sql.title_idx] == NEW_TITLE
    assert actual_rows[2][sql.fid_idx] == FID_C
    assert actual_rows[2][sql.title_idx] == NEW_TITLE


@pytest.mark.parametrize(
    "text, count, expected_message",
    [
        ("Updated {count} records", 1000000, "Updated 1,000,000 records"),
        (
            "Updated {count} records",
            2,
            "Updated 2 records",
        ),
        (
            "A message without a count",
            None,
            "A message without a count",
        ),
    ],
)
def test_notify_slack(text, count, expected_message):
    actual_message = notify_slack.function(text, True, count)
    assert actual_message == expected_message
