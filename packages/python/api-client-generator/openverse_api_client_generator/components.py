from dataclasses import dataclass
from types import NoneType, UnionType
from typing import Any, Iterable, Self, TypeAlias, Union, get_args


def py_type_string(t: type | TypeAlias) -> str:
    """Create a string suitable to serve as a Python type annotation"""
    if t is None or t == NoneType:
        return "None"
    elif isinstance(t, UnionType):
        return " | ".join(py_type_string(a) for a in get_args(t))
    elif isinstance(t, Model):
        return t.name
    elif name := getattr(t, "__name__", None):
        if model := _MODEL_REGISTRY.get(name):
            return model.name

        if not get_args(t):
            return name

        return str(t)

    raise ValueError(f"Could not cast {t}")


def ts_type_string(t: type | TypeAlias) -> str:
    if isinstance(t, Model):
        return t.name
    elif t is None or t == NoneType:
        return "null"
    elif t is str:
        return "string"
    elif t is bool:
        return "boolean"
    elif t is bytes:
        return "ReadableStream"
    elif t is int or t is float:
        return "number"
    elif isinstance(t, UnionType):
        return " | ".join(ts_type_string(a) for a in get_args(t))
    elif name := getattr(t, "__name__", None):
        if model := _MODEL_REGISTRY.get(name, None):
            return model.name

        args = get_args(t)

        match name:
            case "Any":
                return "unknown"

            case "list":
                if args:
                    return f"Array<{ts_type_string(args[0])}>"
                return "readonly unknown[]"

            case "tuple":
                if args:
                    tuple_args = ", ".join([ts_type_string(a) for a in args])
                    return f"readonly [{tuple_args}]"
                return "readonly unknown[]"

            case "dict":
                if args:
                    f"Record<string, {ts_type_string(args[-1])}"

                return "Record<string, unknown>"

    raise ValueError(f"Could not cast {t}")


@dataclass
class Property:
    name: str
    description: str
    type: type | TypeAlias
    nullable: bool
    required: bool

    @property
    def py_type_string(self) -> str:
        """Create a string suitable to serve as a Python type annotation"""
        return py_type_string(self.type)

    @property
    def ts_type_string(self) -> str:
        return ts_type_string(self.type)


@dataclass
class Model:
    name: str
    description: str
    properties: dict[str, Property]

    def __post_init__(self):
        _MODEL_REGISTRY[self.name] = self

    @classmethod
    def from_ref(cls, ref: str) -> Self:
        name = ref.split("/")[-1]
        return _MODEL_REGISTRY[name]

    @property
    def py_properties(self) -> Iterable[Property]:
        return sorted(self.properties.values(), key=lambda p: not p.required)

    def __str__(self):
        return self.name

    def __repr__(self):
        return self.name


_MODEL_REGISTRY: dict[str, Model] = {}


def python_type_from_schema(schema: dict) -> type | TypeAlias:
    match schema.get("type"):
        case "boolean":
            return bool
        case "string":
            return str
        case "integer":
            return int
        case "number":
            return float
        case "array":
            items = schema["items"]
            if not items:
                return list[Any]

            if "$ref" in items:
                return list[Model.from_ref(items["$ref"])]

            return list[python_type_from_schema(items)]
        case None:
            if "allOf" in schema:
                union_args = [
                    Model.from_ref(item["$ref"])
                    if "$ref" in item
                    else python_type_from_schema(item)
                    for item in schema["allOf"]
                ]
                if len(union_args) == 1:
                    return union_args[0]

                return Union[*union_args]

    raise ValueError(f"Unknown type of {schema}")


def model_from_schema(name: str, schema: dict) -> Model:
    properties = {}
    for property_name, property_schema in schema["properties"].items():
        property = Property(
            name=property_name,
            type=python_type_from_schema(property_schema),
            nullable=property_schema.get("nullable", False),
            description=property_schema.get("description", ""),
            required=property_name in schema.get("required", []),
        )
        properties[property_name] = property

    return Model(
        name=name,
        description=schema.get("description", ""),
        properties=properties,
    )
