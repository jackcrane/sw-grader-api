// routes/autoRegister.js
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
// eslint-disable-next-line no-unused-vars
import express from "express";
import { types as utilTypes } from "node:util";

/**
 * Checks if a given file path corresponds to a test file.
 * @param {string} filePath
 * @returns {boolean}
 */
export const isTestFile = (filePath) => {
  const basename = path.basename(filePath);
  if (basename.endsWith(".test.js") || basename.endsWith(".spec.js"))
    return true;
  const segments = filePath.split(path.sep);
  if (
    segments.includes("tests") ||
    segments.includes("__tests__") ||
    segments.includes("__snapshots__")
  ) {
    return true;
  }
  return false;
};

/**
 * Converts a file path into an Express route path.
 * @param {string} filePath - Absolute path to the route file.
 * @param {string} routesDir - Absolute path to the routes directory.
 * @returns {string}
 */
export const getRoutePathFromFile = (filePath, routesDir) => {
  let relativePath = path.relative(routesDir, filePath);
  relativePath = relativePath.replace(/\\/g, "/"); // Windows safety
  relativePath = relativePath.replace(/\.js$/, ""); // drop extension
  // [param] -> :param
  relativePath = relativePath.replace(/\[([^\]]+)\]/g, ":$1");

  // Handle index.js
  if (path.basename(filePath) === "index.js") {
    const dir = path.dirname(relativePath);
    relativePath = dir === "." ? "" : dir;
  }

  if (!relativePath.startsWith("/")) relativePath = "/" + relativePath;
  return "/api" + relativePath;
};

/**
 * Wrap a handler to use Server-Sent Events if it's a generator function.
 * Supports both sync and async generator functions.
 * Non-generator handlers are returned untouched.
 * @param {(req,res,next)=>any} handler
 * @returns {(req,res,next)=>any}
 */
export const wrapSSEIfGenerator = (handler) => {
  const isGenFn =
    utilTypes.isGeneratorFunction(handler) ||
    utilTypes.isAsyncGeneratorFunction(handler);
  if (!isGenFn) return handler;

  // Convert sync generator to async iterator for unified handling
  const toAsyncIter = (iterable) => {
    if (Symbol.asyncIterator in Object(iterable)) return iterable;
    if (Symbol.iterator in Object(iterable)) {
      const it = iterable[Symbol.iterator]();
      return {
        [Symbol.asyncIterator]() {
          return this;
        },
        async next() {
          return it.next();
        },
        async return(v) {
          return typeof it.return === "function"
            ? it.return(v)
            : { done: true, value: v };
        },
        async throw(e) {
          if (typeof it.throw === "function") return it.throw(e);
          throw e;
        },
      };
    }
    return null;
  };

  const sseHandler = async (req, res, next) => {
    // Prepare SSE headers
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    // Allow CORS-friendly streaming if the app uses CORS elsewhere
    if (!res.getHeader("Access-Control-Allow-Origin")) {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }

    // Immediately flush headers
    // Some proxies require an initial newline to start streaming
    res.write(": ok\n\n");

    let iterator;
    let closed = false;
    const onClose = () => {
      closed = true;
      // Best-effort close
      try {
        if (iterator && typeof iterator.return === "function")
          iterator.return();
      } catch {}
    };
    req.on("close", onClose);
    req.on("end", onClose);
    req.on("aborted", onClose);

    try {
      // Call the original generator handler to obtain the iterator
      const produced = handler(req, res, next);
      iterator = toAsyncIter(produced);
      if (!iterator) {
        // If the handler didn't return an iterator after all, hand off to next()
        return next();
      }

      for await (const chunk of iterator) {
        if (closed) break;
        const payload =
          typeof chunk === "string" ? chunk : JSON.stringify(chunk);
        // You can optionally support id/event fields by yielding objects like { event, id, data }
        if (
          typeof chunk === "object" &&
          chunk &&
          ("event" in chunk || "id" in chunk || "data" in chunk)
        ) {
          if (chunk.event) res.write(`event: ${String(chunk.event)}\n`);
          if (chunk.id) res.write(`id: ${String(chunk.id)}\n`);
          const data = "data" in chunk ? chunk.data : chunk;
          const body = typeof data === "string" ? data : JSON.stringify(data);
          for (const line of body.split("\n")) {
            res.write(`data: ${line}\n`);
          }
          res.write("\n");
        } else {
          for (const line of payload.split("\n")) {
            res.write(`data: ${line}\n`);
          }
          res.write("\n");
        }
        // Optionally flush if using compression middlewares (should be disabled for SSE)
        // res.flush?.();
      }

      if (!closed) {
        // Signal stream end
        res.write("event: end\ndata: [DONE]\n\n");
        res.end();
      }
    } catch (err) {
      if (!closed) {
        // Send an error event then end
        const msg = err && err.message ? err.message : "stream error";
        res.write(
          `event: error\ndata: ${JSON.stringify({ message: msg })}\n\n`
        );
        res.end();
      }
    } finally {
      req.off("close", onClose);
      req.off("end", onClose);
      req.off("aborted", onClose);
    }
  };

  return sseHandler;
};

/**
 * Normalize a handler or array of handlers and apply SSE wrapping when needed.
 * @param {any} maybeHandlers
 * @returns {Array<Function>}
 */
export const normalizeHandlers = (maybeHandlers) => {
  const handlers = Array.isArray(maybeHandlers)
    ? maybeHandlers
    : [maybeHandlers];
  return handlers.map((h) => wrapSSEIfGenerator(h));
};

/**
 * Recursively traverses the routes directory and registers routes with Express.
 * If an exported handler is a generator function (sync or async), it will be wired
 * as a Server-Sent Events endpoint automatically.
 * Supported named exports: get, post, put, patch, head, options, query, del
 *
 * @param {express.Application} app
 * @param {string} routesDir - Absolute path to the routes directory.
 */
export const registerRoutes = async (app, routesDir) => {
  const traverseDir = async (dir) => {
    // Static routes before dynamic ([param]) for correct precedence
    const files = fs.readdirSync(dir).sort((a, b) => {
      const aIsDyn = a.includes("[");
      const bIsDyn = b.includes("[");
      if (aIsDyn !== bIsDyn) return aIsDyn - bIsDyn; // static first
      return a.localeCompare(b);
    });

    for (const file of files) {
      const filePath = path.join(dir, file);
      if (isTestFile(filePath)) continue;

      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        await traverseDir(filePath);
        continue;
      }

      if (!(stat.isFile() && file.endsWith(".js"))) continue;

      const routePath = getRoutePathFromFile(filePath, routesDir);
      const routeModule = await import(pathToFileURL(filePath).href);

      // Supported HTTP methods
      ["get", "post", "put", "patch", "head", "options", "query"].forEach(
        (method) => {
          if (!routeModule[method]) return;

          const handlers = normalizeHandlers(routeModule[method]);

          if (method === "query") {
            // Non-standard verb surfaced via GET with filtering
            const wrapped = handlers.map((h) => {
              return (req, res, next) => {
                if (req.method !== "QUERY") return next();
                return h(req, res, next);
              };
            });
            app.all(routePath, ...wrapped);
            return;
          }

          app[method](routePath, ...handlers);
        }
      );

      // DELETE is exposed as `del` to avoid reserved word issues
      if (routeModule.del) {
        const delHandlers = normalizeHandlers(routeModule.del);
        app.delete(routePath, ...delHandlers);
      }
    }
  };

  await traverseDir(routesDir);
};
