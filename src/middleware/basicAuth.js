const { timingSafeEqual } = require("node:crypto");

function matchesCredential(actual, expected) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function basicAuth(username, password) {
  if (!username || username.includes(":") || !password) {
    throw new Error("IMX Scout production authentication requires a username and password.");
  }

  return (req, res, next) => {
    const authorization = req.headers.authorization || "";
    const match = /^Basic\s+([A-Za-z0-9+/]+={0,2})$/i.exec(authorization);

    if (match) {
      const credentials = Buffer.from(match[1], "base64").toString("utf8");
      const separator = credentials.indexOf(":");

      if (separator !== -1) {
        const providedUsername = credentials.slice(0, separator);
        const providedPassword = credentials.slice(separator + 1);
        const usernameMatches = matchesCredential(providedUsername, username);
        const passwordMatches = matchesCredential(providedPassword, password);

        if (usernameMatches && passwordMatches) return next();
      }
    }

    res.statusCode = 401;
    res.setHeader("WWW-Authenticate", 'Basic realm="IMX Scout", charset="UTF-8"');
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.end("Authentication required");
  };
}

module.exports = basicAuth;
