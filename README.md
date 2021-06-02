# SkyTemple patcher

Tool for automatic patching of EoS ROMs. The tool automatically applies patches to ensure that the ROM is clean and from the right region, so it works on all common (decrypted) ROM versions versions and dumps. All patches must be generated from a "clean" ROM.

## Parameters

The following query parameters are supported. You must pass at least either `name` or `url`.

- `name`: The short name of a romhack on `https://hacks.skytemple.org`. For example, if the overview page of a hack has the URL.
`https://hacks.skytemple.org/h/myhack`, pass `myhack` as the parameter value
- `url`: Direct URL to a VCDiff (`.xdelta`) patch file. The resource must include [CORS headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS).
- `region`: The region of the ROM the patch was generated from, currently `us` and `eu` are supported (default: `us`). Ignored if `name` is set.
- `sha1` (optional): The SHA-1 checksum of the final patched ROM. If provided, it is used to validate if the patch was applied correctly.

## Limitations

- Secondary compression is not supported. Please disable secondary compression with the `-S` flag when generating patches with `xdelta`.
- Patches are not validated, so a `target window checksum mismatch` error wouldn't be detected (the input ROM is validated against an SHA-1 checksum, however)

## Local development server

Start the local development server with `npm start`.
