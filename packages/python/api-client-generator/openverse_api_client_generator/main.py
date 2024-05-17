from http.client import HTTPResponse
from pathlib import Path
from urllib.request import urlopen

import yaml

from openverse_api_client_generator.components import Model, model_from_schema
from openverse_api_client_generator.template_env import templates


def get_models(component_schemas: dict, model_names: list[str]) -> dict[str, Model]:
    models = {}
    for name in model_names:
        schema = component_schemas[name]
        models[name] = model_from_schema(name, schema)

    return models


def main(openverse_api_url: str) -> None:
    openverse_api_url = (
        openverse_api_url[:-1] if openverse_api_url[-1] == "/" else openverse_api_url
    )
    schema_res: HTTPResponse = urlopen(f"{openverse_api_url}/v1/schema/")

    schema_bytes = schema_res.read()
    out_schema = Path.cwd() / "schema.yaml"
    out_schema.unlink(missing_ok=True)
    out_schema.write_bytes(schema_bytes)

    schema: dict = yaml.full_load(schema_bytes)

    models = get_models(
        schema["components"]["schemas"],
        [
            "Provider",
            "Tag",
            "AudioAltFile",
            "AudioSet",
            "Audio",
            "Image",
        ],
    )

    for filetype in ["py", "ts"]:
        rendered_models = templates[filetype]["models"].render(
            models=models,
        )

        models_out = Path(__file__).parents[1] / "out" / f"models.{filetype}"
        models_out.unlink(missing_ok=True)
        models_out.write_text(rendered_models)
