import argparse

from openverse_api_client_generator.main import main


arg_parser = argparse.ArgumentParser()
arg_parser.add_argument(
    "--openverse-api-url",
    default="http://localhost:50280",
    help="URL of the Openverse API instance to use (default to api.openverse.org)",
)


def cli():
    args = arg_parser.parse_args()
    main(**args.__dict__)
