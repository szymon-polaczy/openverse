from jinja2 import Environment, PackageLoader, select_autoescape

from openverse_api_client_generator.components import py_type_string, ts_type_string


template_env = Environment(
    loader=PackageLoader("openverse_api_client_generator"),
    autoescape=select_autoescape(),
)

template_env.filters["ts_type_string"] = ts_type_string
template_env.filters["py_type_string"] = py_type_string

templates = {
    "py": {
        "models": template_env.get_template("models.py.j2"),
    },
    "ts": {
        "models": template_env.get_template("models.ts.j2"),
        "routes": template_env.get_template("routes.ts.j2"),
    },
}
