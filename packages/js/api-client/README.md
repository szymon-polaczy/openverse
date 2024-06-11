# @openverse/api-client

Thoroughly typed JavaScript client for the Openverse API.

[![NPM Version](https://img.shields.io/npm/v/%40openverse%2Fapi-client)](https://www.npmjs.com/package/@openverse/api-client)

---

## Installation

```console
npm install @openverse/api-client
```

By default, global fetch is used to make request. As such, there is no explicit
HTTP client library dependency.

## Usage

Requests to the Openverse API are made through a function returned by
`OpenverseClient`. The function accepts a string parameter representing the
endpoint's method and route. TypeScript infers the possible query parameters for
that endpoint, which are passed as the `params` property of the second argument.

```ts
import { OpenverseClient } from "@openverse/api-client"

const openverse = OpenverseClient()

const images = await openverse("GET v1/images/", {
  params: {
    q: "dogs",
    license: "by-nc-sa",
    source: ["flickr", "wikimedia"],
  },
})

images.body.results.forEach((image) => console.log(image.title))
```

All responses bear the following properties:

- `body`: The API response. For JSON responses, this will be an object. For all
  others (e.g., thumbnail requests), this will be an untouched `ReadableStream`
  (`response.body` from `fetch`).
- `meta`: An object containing the following information about the request:
  - `headers`: Response headers
  - `status`: The status of the response
  - `url`: The final URL, including query parameters, the client made the
    request with
  - `request`: The `RequestInit` object passed to fetch, including `headers` and
    `body`.

### Rate limiting

The requester function does _not_ automatically handle rate limit back-off. To
implement this yourself, check the rate limit headers from the response
`meta.headers`.

### Authentication

By default, the `OpenverseClient` function will return an unauthenticated
client.

To use an authenticated client, pass a `credentials` object containing
`clientId` and `clientSecret` to the `OpenverseClient` function. The client will
automatically request tokens as needed, including upon expiration.

```ts
import { OpenverseClient } from "@openverse/api-client"

const authenticatedOpenverse = OpenverseClient({
  credentials: {
    clientId: "...",
    clientSecret: "...",
  },
})
```

`OpenverseClient` automatically requests API tokens when authenticated,
including eagerly refreshing tokens to avoid halting ongoing requests. This is
safe, as the Openverse API does not immediately expire existing tokens when a
new one issued. This also means you do not need to share the same token between
multiple client instances (e.g., across multiple instances of the same
application, as in an application server cluster).

### Alternative Openverse API instances

By default, the main Openverse API is used at
https://api.openverse.engineering/. Other Openverse API instances may be used by
passing `baseUrl` to the `OpenverseClient` function:

```ts
import { OpenverseClient } from "@openverse/api-client"

const localhostOpenverse = OpenverseClient({
  baseUrl: "localhost:50280",
})
```

### Transports

If you already rely on an HTTP client other than globally available fetch, you
can pass a `getTransport` function as the second parameter to `OpenverseClient`.
See the exported `Transport` type for a definition of what this function must
return.

## License

`@openverse/api-client` is distributed under the terms of the
[GNU Lesser General Public License v3.0 or later](https://spdx.org/licenses/LGPL-3.0-or-later.html)
license.
