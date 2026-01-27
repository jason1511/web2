export default async (request, context) => {
  // Protect ONLY /upload.html (we'll map it in netlify.toml next)
  // Set credentials in Netlify env var: UPLOAD_BASIC_AUTH = "username:password"
  const creds = Deno.env.get("UPLOAD_BASIC_AUTH");

  // If you forgot to set env var, fail CLOSED (deny) rather than open.
  if (!creds) {
    return new Response("Upload is locked (missing server config).", { status: 401 });
  }

  const auth = request.headers.get("authorization") || "";
  const expected = "Basic " + btoa(creds);

  if (auth !== expected) {
    return new Response("Authentication required.", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Upload", charset="UTF-8"',
        "Cache-Control": "no-store",
      },
    });
  }

  // Authorized → continue to the page
  return context.next();
};
