/**
 * Created by konstardiy on 2014-05-03.
 */
"use strict";
var urlUtils = require('url');
var util = require('util');
var express = require('express');

function isFunction(v) {
    return v && typeof v === 'function' || v instanceof Function || v.constructor === Function;
}


function getFunctionParameterNames(func) {
    var result = [];
    var str = '' + ('' + func).substring('function '.length).split('(', 2)[1].split(')')[0];

    var names = str.split(',');
    for(var p = 0; p < names.length;p++) {
        var name = names[p].trim();
        result.push(name);
    }
    return result;
}

function getFullUrl(req) {
    //noinspection JSCheckFunctionSignatures
    var port = req.app.get('port');
    if (!req.fullUrl) {
        var pathAndQuery = req.originalUrl.split('?');
        var urlParts = { protocol : req.protocol, host : req.get('host'), port: port, pathname : pathAndQuery[0]  };
        if (pathAndQuery.length > 1 && pathAndQuery[1]) {
            urlParts.search = pathAndQuery[1];
        }
        req.fullUrl = urlUtils.format(urlParts);
    }
    return req.fullUrl;
}
function getParsedFullUrl(req) {
    if (!req.parsedFullUrl) {
        req.parsedFullUrl = urlUtils.parse(getFullUrl(req), true);
    }
    return req.parsedFullUrl;
}


function generateRouteHandler(context, code, paramReaders) {
    return function InvokeAPIHandler(req, res, next) {
        var args = [];
        var self = {
            context : context,
            req : req,
            user : req.user,
            fullUrl : getFullUrl(req),
            parsedFullUrl : getParsedFullUrl(req),
            res : res,
            send : function(a, b) {
                if (b) {
                    res.send(a, b);
                }
                else {
                    res.send(a);
                }
            },
            next:function call_next() { next(); },
            redirect : function(url, status) {
                return res.redirect(url, status);
            },
            error:function(message) {
                return res.send(message, 500);
            }
        };
        for(var p = 0; p < paramReaders.length; p++) {
            var value = paramReaders[p](req);
            args.push(value);
        }
        try {
            var result  = code.apply(self, args);
            if (util.isError(result)) {
                //noinspection ExceptionCaughtLocallyJS
                throw result;
            }
            if (result !== undefined) if (typeof result.then === 'function' || result.then instanceof Function) {
                result.then(function(v) {
                        self.send(v);
                    },
                    function(err) {
                        console.error(err);
                        res.send(500, err.message || err);
                    });
            }
            else {
                res.send(result);
            }
        }
        catch(e) {
            console.error(e);
            res.send(500, e.message);
        }
    };
}

function readQueryStringParameter(name, parser, req) {
    var q =  getParsedFullUrl(req);
    if (q.query) {
        return parser(q.query[name], req, name);
    }
    else {
        return undefined;
    }
}

//noinspection JSUnusedLocalSymbols
function readBodyParameter(name, parser, req) {
    return parser(req.body, req, name);
}

function readRouteParameter(name, parser, req) {
    return parser(req.params[name], req, name);
}

var sourcesMap = {
    "route" : readRouteParameter,
    "param" : readRouteParameter,
    "querystring":readQueryStringParameter,
    "qs":readQueryStringParameter,
    "body":readBodyParameter,
    "path":readRouteParameter
};

function getRawValue(value) {
    return value;
}

function getBooleanValue(value) {
    if (value === undefined || value === null || value === '') {
        return false;
    }
    else {
        return value ? true : false;
    }
}

function getIntegerValue(value) {
    if (value === undefined || value === null || value === '') {
        return 0;
    }
    else {
        return parseInt(value, 10);
    }
}

function getFloatValue(value) {
    if (value === undefined || value === null || value === '') {
        return 0;
    }
    else {
        return parseFloat(value);
    }
}

function getDateValue(value) {
    if (value === undefined || value === null || value === '') {
        return 0;
    }
    else {
        return new Date(value);
    }
}

function getObjectValue(value) {
    if (!value) {
        return null;
    }
    if (typeof value === 'string' || value instanceof String) {
        return JSON.parse(value);
    }
    return value;
}

function getStringValue(value) {
    if (value === undefined || value === null || value === '') {
        return value;
    }
    else {
        return value.toString();
    }
}

var typesMap = {
    "i": getIntegerValue,
    "int": getIntegerValue,
    "integer": getIntegerValue,
    "f": getFloatValue,
    "float": getFloatValue,
    "f32": getFloatValue,
    "double": getFloatValue,
    "f64": getFloatValue,
    "n": getFloatValue,
    "number": getFloatValue,
    "b": getBooleanValue,
    "bool": getBooleanValue,
    "boolean": getBooleanValue,
    "o": getObjectValue,
    "obj": getObjectValue,
    "object": getObjectValue,
    "d" : getDateValue,
    "date": getDateValue,
    "s": getStringValue,
    "str":  getStringValue,
    "string":  getStringValue,
    "raw" : getRawValue

};

/**
 * Registers a value parser for one (string) or multiple (Array of String) type specifiers
 * @param {String|Array} suffix
 * @param {Function) transform value parsing callback like finction(rawValue) => parsed value
 */
exports.registerTypeParser = function(suffix, transform) {
    if (!suffix) {
        throw new Error("Type suffix is required");
    }
    if (!transform) {
        throw new Error("transform is required");
    }
    if (!isFunction(transform)) {
        throw new Error("Transform is not a function");
    }
    var suffixes = null;
    if (typeof suffix == 'strng' || suffix instanceof String) {
        suffixes = [suffix];
    }
    else {
        suffixes = suffix;
    }
    suffixes.forEach(function(_suffix) {
        _suffix = _suffix.toString().toLowerCase();
        typesMap[_suffix] = transform;
    });
};

/**
 * Registers a value reader for one {string} or multiple {Array of String} value readers
 * @param {String|Array} prefix - to map to value reader callback
 * @param {Function} readerCallback - value reader callback - function(name, parser, req),
 */
exports.registerValuesReader = function(prefix, readerCallback) {
    if (!prefix) {
        throw new Error("Source prefix is required");
    }
    if (!readerCallback) {
        throw new Error("Reader callback is required");
    }
    if (!isFunction(readerCallback)) {
        throw new Error("Reader callback is not a function");
    }
    var prefixes = null;
    if (typeof prefix === 'string' || prefix instanceof String) {
        prefixes = [prefix];
    }
    else {
        prefixes = prefix;
    }
    prefixes.forEach(function(_prefix) {
        _prefix = _prefix.toString().toLowerCase();
        sourcesMap[_prefix] = readerCallback;
    })
}

/**
 * Template of secured application
 * @param app {express.application}
 * @param authMiddleware {function(req,res,next)}
 * @constructor
 */
function SecuredApplication(app, authMiddleware) {
    /**
     * @field app
     * @type {express.application}
     * @api private
     */
    this.app = app;
    var auth = authMiddleware;
    if (auth) {
        this.callAuth = function(req, res, next) {
            return auth(req, res, next);
        };
    }
    else {
        this.callAuth = function (req, res, next) {
            return next ? next() : undefined;
        };
    }
}

/**
 * Registers unsafe GET route, where authorization middleware is not called. same as express.applicaton.get
 * @param route
 * @param func
 * @returns {Any}
 */
SecuredApplication.prototype.get = function(route, func) {
    return this.app.get(route, func);
};

/**
 * Registers unsafe POST route, where authorization middleware is not called. same as express.applicaton.post
 * @param route
 * @param func
 * @returns {*}
 */
SecuredApplication.prototype.post = function(route, func) {
    return this.app.post(route, func);
};

/**
 * Registers unsafe PUT route, where authorization middleware is not called. same as express.applicaton.put
 * @param route
 * @param func
 * @returns {*}
 */
SecuredApplication.prototype.put = function(route, func) {
    return this.app.put(route, func);
};

/**
 * Registers unsafe PATCH route, where authorization middleware is not called. same as express.applicaton.patch
 * @param route
 * @param func
 * @returns {*}
 */
SecuredApplication.prototype.patch = function(route, func) {
    return this.app.patch(route, func);
};

/**
 * Registers unsafe DELETE route, where authorization middleware is not called. same as express.applicaton.delete
 * @param route
 * @param func
 * @returns {*}
 */
SecuredApplication.prototype.del = function(route, func) {
    return this.app.del(route, func);
};

/**
 * Registers unsafe OPTIOMS route, where authorization middleware is not called. same as express.applicaton.options
 * @param route
 * @param func
 * @returns {*}
 */
SecuredApplication.prototype.options = function(route, func) {
    return this.app.options(route, func);
};

/**
 * Registers safe GET route, where authorization middleware is called just before the desired callback.
 * Same as express.applicaton.get(route, [authMiddleware, func]) call.
 * @param route
 * @param func
 * @returns {*}
 */
SecuredApplication.prototype.safeGet = function(route, func) {
    return this.app.get(route, this.callAuth, func);
};

/**
 * Registers safe POST route, where authorization middleware is called just before the desired callback.
 * Same as express.applicaton.post(route, [authMiddleware, func]) call.
 * @param route
 * @param func
 * @returns {*}
 */
SecuredApplication.prototype.safePost = function(route, func) {
    return this.app.post(route, this.callAuth, func);
};

/**
 * Registers safe PUT route, where authorization middleware is called just before the desired callback.
 * Same as express.applicaton.put(route, [authMiddleware, func]) call.
 * @param route
 * @param func
 * @returns {*}
 */
SecuredApplication.prototype.safePut = function(route, func) {
    return this.app.put(route, this.callAuth, func);
};

/**
 * Registers safe PATCH route, where authorization middleware is called just before the desired callback.
 * Same as express.applicaton.patch(route, [authMiddleware, func]) call.
 * @param route
 * @param func
 * @returns {*}
 */
SecuredApplication.prototype.safePatch = function(route, func) {
    return this.app.patch(route, this.callAuth, func);
};

/**
 * Registers safe DELETE route, where authorization middleware is called just before the desired callback.
 * Same as express.applicaton.del(route, [authMiddleware, func]) call.
 * @param route
 * @param func
 * @returns {*}
 */
SecuredApplication.prototype.safeDel = function(route, func) {
    return this.app.del(route, this.callAuth, func);
};

/**
 * Registers safe DELETE route, where authorization middleware is called just before the desired callback.
 * Same as express.applicaton.del(route, [authMiddleware, func]) call.
 * @param route
 * @param func
 * @returns {*}
 */
SecuredApplication.prototype.safeOptions = function(route, func) {
    return this.app.options(route, this.callAuth, func);
};

/**
 * Adds secured versions of VERB methods to the express application
 * @param app {express.application}
 * @param authMiddleware {function(req,res,next)}
 * @returns {express.application}
 */
module.exports.secureApplication = function(app, authMiddleware) {
    if (app.hasOwnProperty("__secured") &&  app.__secured === true)
    {
        return app;
    }
    var safeApp = new SecuredApplication(app, authMiddleware);

    //noinspection JSUndefinedPropertyAssignment
    app.safeGet = function(path, callback) {
        return safeApp.safeGet(path, callback);
    };

    //noinspection JSUndefinedPropertyAssignment
    app.safePost = function(path, callback) {
        return safeApp.safePost(path, callback);
    };

    //noinspection JSUndefinedPropertyAssignment
    app.safePut = function(path, callback) {
        return safeApp.safePut(path, callback);
    };

    //noinspection JSUndefinedPropertyAssignment
    app.safePatch = function(path, callback) {
        return safeApp.safePatch(path, callback);
    };

    //noinspection JSUndefinedPropertyAssignment
    app.safeDel = function(path, callback) {
        return safeApp.safeDel(path, callback);
    };

    //noinspection JSUndefinedPropertyAssignment
    app.safeOptions = function(path, callback) {
        return safeApp.safeOptions(path, callback);
    };

    //noinspection JSUndefinedPropertyAssignment
    app.__secured = true;
    return app;

};

/**
 * Adds described API routes with optional security middleware
 * @param {(SecuredApplication|express.application)} app
 * @param {Object} apiSchema
 * @param {function(req, res, next)} [authMiddleware]
 */
module.exports.registerAPI = function(app, apiSchema, authMiddleware) {
    var path = (apiSchema.baseUri || '/api/') + apiSchema.name;
    if (authMiddleware) {
        app = new SecuredApplication(app, authMiddleware);
    }
    var addGet = apiSchema.secure ? app.safeGet.bind(app) : app.get.bind(app);
    var addPost = apiSchema.secure ? app.safePost.bind(app) : app.post.bind(app);
    var addPut = apiSchema.secure ? app.safePut.bind(app) : app.put.bind(app);
    var addPatch = apiSchema.secure ? app.safePatch.bind(app) : app.patch.bind(app);
    var addDelete = apiSchema.secure ? app.safeDel.bind(app) : app.del.bind(app);
    var addOptions = apiSchema.secure ? app.safeOptions.bind(app) : app.options.bind(app);
    var methodsMap = {
        'GET' : addGet,
        'POST' : addPost,
        'PATCH' : addPatch,
        'PUT' : addPut,
        'DELETE' : addDelete,
        'OPTIONS' : addOptions
    };

    for(var action in apiSchema) {
        if (apiSchema.hasOwnProperty(action)) {
            var actionId = action.toString();
            if (action === 'secure' || action === 'name' || action === 'baseUri') {
                continue;
            }
            var actionCode = apiSchema[action];

            var routeUrl = path;

            var methodName ='GET';
            var actionName = action;
            var addOp = addGet;

            var hasMethod = false;
            for(var method in methodsMap)
            {
                if (actionId.indexOf(method +'_') === 0) {
                    methodName = method;
                    actionName = actionId.substring(methodName.length+1);
                    //noinspection JSUnfilteredForInLoop
                    addOp = methodsMap[method];
                    routeUrl = routeUrl + '/' + actionName;
                    hasMethod = true;
                    break;
                }
            }

            if (!hasMethod) {
                if (methodsMap.hasOwnProperty(actionId)) {
                    methodName = actionId;
                    actionName = actionId;
                    addOp = methodsMap[actionId];
                    hasMethod = true;
                }
            }

            if (!hasMethod) {
                throw new Error("Unable to detect HTTP method from action name "+actionId);
            }

            var names = getFunctionParameterNames(actionCode);
            var paramReaders = [];
            for(var i = 0; i < names.length; i++) {
                var name = names[i];
                /**
                 * Pieces of function name
                 * @variable namePieces
                 * @type {Array}
                 */
                var namePieces = name.split('_');
                var sourcePrefix = 'route';
                var typeSuffix = "raw";
                if (namePieces.length === 1) {
                    name = namePieces[0];
                }
                else if (namePieces.length === 2) {
                    name = namePieces[1];
                    sourcePrefix = namePieces[0].toLowerCase();
                }
                else {
                    name = namePieces[1];
                    sourcePrefix = namePieces[0].toLowerCase();
                    typeSuffix = namePieces[2].toLowerCase();
                }

                var reader = null;
                if (sourcesMap.hasOwnProperty(sourcePrefix)) {
                    reader = sourcesMap[sourcePrefix];
                }
                else {
                    throw new Error("Unknown source prefix: "+sourcePrefix);
                }

                if (sourcePrefix === 'path') {
                    routeUrl = routeUrl + "/*" + name;
                }
                else if (sourcePrefix === 'route' || sourcePrefix === 'param') {
                    routeUrl = routeUrl + '/:'+name;
                }

                var parser = null;
                if (typesMap.hasOwnProperty(typeSuffix)) {
                    parser = typesMap[typeSuffix];
                }
                else {
                    throw new Error("Unknown type suffix: "+typeSuffix);
                }

                paramReaders.push(reader.bind(null, name, parser));

            }
            var apiHandler = generateRouteHandler(apiSchema, actionCode, paramReaders);
            addOp(routeUrl, apiHandler);



        }
    }
};