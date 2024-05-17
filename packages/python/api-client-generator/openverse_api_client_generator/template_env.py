from jinja2 import Environment, PackageLoader, select_autoescape


template_env = Environment(
    loader=PackageLoader("openverse_api_client_generator"),
    autoescape=select_autoescape(),
)

templates = {
    "py": {
        "models": template_env.get_template("models.py.j2"),
    },
    "ts": {
        "models": template_env.get_template("models.ts.j2"),
    },
}
