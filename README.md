api-tools
=========

A helper library for express to generate a set of RESTful routes using a provided object and some conventions

Usage
=====

You can register an API by making the following call:

        apiUtils.registerAPI(app, require('./routes/tasks-api'));

If you need the APIs within your apps

        apiUtils.registerAPI(app, require('./routes/tasks-api'), isLoggedIn);

where ___isLoggedIn___ is a middleware responsible to decide whether the user has access to route. The idea of that
middleware is to call ___next___ layer, that is the api being registered, only if user have access to that API.

Instead of specifying the security middleware on every api, you can secure the whole app. This will add the following
 methods to the app: safeGet, safePost, safePut, safeDel, safeOptions. These wrapper methods will register both desired
 callback (api invoker) and your security middleware.
Global securing can be made with the following call:

    var safeApp = apiTools.secureApplication(app, isLoggedIn);

where

*  ___safeApp___ is the wrapper with VERB and __safe__Verb methods,
* ___app___ is your express application,
* ___isLoggedIn___ is your securityMiddleware.

The call listed above will have the special side effect: the __safe__VERB methods will be added to the application
being secured.
The "unsafe" application methods (get, put, post, patch, del, options) are not modified.
The safe methods are named as: safeGet, safePost, safePut, safePatch, safeDel, safeOptions.

API descriptor and conventions
==============================

The following properties are expected by registerAPI method:

* __baseUri__ - optional base url if your API. default value is ``/api/``
* __name__ - the name, that becomes part of route to actions of API descriptor is about.
Base route route is built using template:

        /{baseUri}/[name]

* __secure__ - if this value is present and considered by JavaScript as ___true___, the safe routes are registered
using __safe__VERB methods. otherwise unsafe methods will be used - get, post, put, patch, options.

By design, methods are expected to be explicitly "assigned" to object as its "properties" (prototype is ignored).
By design, bound methods are not supported since they are considered as native methods by runtime.
Each method you desire to be used as API action, should have a name and parameters names that should follow these rules:
a) __VERB__ - GET, POST, PUT, PATCH, DELETE, OPTIONS. In this case, no action name is added to the route.
b) [VERB]_[action} - the [action] part is being appended to route that becomes /api/{name}/{action}.
E g. GET_pageOf is sample of method that will be invoked on GET request for a route /api/{name}/pageOf.
c) __actionName__ - the route gets the [action] part appended, and becomes /api/[name]/[action]. This route will be
served om GET method.

The number of parameters and their naming should follow these rules:
a) [name] - raw value is obtained from req.params object of the Express request.
b) route_[name], param_[name] - same behavior.
c) path_[name] - raw value is obtained from req.params object of te Express request.
c) qs_[name], querystring_[name] - raw value will be read form the query string.
d) body_[name] - whole req.body will be provided as value of this parameter.


For every parameter whom source was specified as route (a & b rules), the following change on route will happen:
the ```:name``` will be appended to route so the route will become

        /api/{name}/{action}/:{param_name}

or
        /api/{name}/:{param_name}

depending on the previously build route for the method.

When source specified as path, the source itself is a route parameter *name* but tje route is added by `*name` syntax,
so the route will becomes

        /api/{name}/*{param_name}

or
        /api/{name}/*{param_name}

So, if you will have a method like this:

        GET:function(route_id) {

This will map function to route

        /api/{name}/:id

While

        GET_transactions: function(route_userId)

will be mapped to route

        /api/{name}/transactions/:userId

You can specify desired type, the value should be converted to, if parameter name will follow this convention:

        {source}_{name}_{type}

The parameter route_userId_i will be mapped to route parameter (req.params) property userId and its value
will be converted to integer using parseInt function.
The following suffixes are known by default:

* i, int, integer - integer number
* f, float, f32, double, f64, n, number - floating number or 0.0
* b, bool, boolean - boolean value or false
* o, obj, object - Javascript Object or null. String will be parsed by JSON.parse
* d,date - Date value
* s, str, string - String value
* raw - Value from client is not preprocessed at all

Tou can modify this map or extend it with the following calls (make them __before__ registering any APIs since the
preprocessor for parameter is picked when the ___registerAPI___ call is being made.

Here are some examples to summarize the rules listed above:

The object

        ```javascript
        {
            name : "tasks",
            secure:true,
            GET : function(qs_pageIndex_i, qs_pageSize_i, qs_keywords_s) { }
            PUT(route_projectId_i, body_properties_obj) {},
            PATCH_setTaskParent(qs_taskId_int, path_targetPath_str) {},
            DELETE:function(route_taskId_i) {}
        }
        ```

will be mapped to these routes:

        GET /api/tasks

will be mapped to _GET_ method and expect for following query string parameters:

* pageIndex - _integer_
* pageSize - _integer_
* keywords - _string_

        PUT /api/tasks/:projectId

will be mapped to PUT method and expect for route parameter named *projectId* of type _integer_ and parsed body will be
provided to parameter body_properties_obj as a parsed object, expecting a valid JSON.

        PATCH /api/tasks/setTaskParent/*targetPath

will be mapped to PATCH_setTaskParent method, and parameters wil get parameters as follows:

* path_targetPath_str - string from route parameter _targetPath_
* qs_taskId_int - integer from query string parameter _taskId_


    DELETE /api/tasks/:taskId

will be mapped to DELETE method, expecting the _taskId_ route parameter as _integer_ value, that will be
assigned to **route_taskId_i** parameter.

Custom values parsers and custom values sources
===============================================
Using the API listed below you can improve values reading and parsing by providing special callback mapped
to a type specifier suffix or value source prefix.
Value readers
-------------
Value reader is a function, that reads raw value from a source and send it to value parser with context data.
Value reader MUST have the following signature:

        function(name, parser, req)

The order of arguments are so because the library applies binding to `name` and `parser` arguments.

The default reader for query string values is shown below:

    function readQueryStringParameter(name, parser, req) {
        var q =  getParsedFullUrl(req);
        if (q.query) {
            return parser(q.query[name], req, name);
        }
        else {
            return undefined;
        }
    }
    
use the `registerValuesReader` function to register own value reader:

        apiTools.registerValuesReader('prefix_literal', function(name, parser, req) {
        });
        
If you need map multiple prefixes to your reader callback, use the following multi-prefix form of call:

        apiTools.registerValuesReader(['prefix_literal', 'pref_lit'], function(name, parser, req) {
        });


Value parsers
-------------
Value parser ensures that parsed value has the desired type, e. g. it parses the date literal and returns Date object.
Value parser MUST have the following signature:

        function(value, req, name)

If your value parser does not need the `name` and `req` by consuming only the first parameter with signature like this:

        function(value)

Value, returned by parser, becomes the argument value in the call of your API function being mapped to the route.

Value parsers are registered by calllng the `registerTypeParser` function like so

        apiTools.registerTypeParser('suffix_literal', function(value, name, req) {
        });

or for multiple suffixes like so:

         apiTools.registerTypeParser(]'suffix_literal', 'sfx'], function(value, name, req) {
         });

Predefined readers and parsers replacement
------------------------------------------
While you can replace default value readers and value parsers, you should care about the fact that library 
use some of them in a special way. E. g. default value reader for route parameters, when bound to a function parameter, 
affects the resulting route literal (prefixes `route` and `param` adds `:{param_naee}` construct to the route while the
`path` prefix adds the `*{param_name}` construct ot the route. The `body` prefix des not affect route.




Provided context
================

The action methods should catch own context ( __this__ ) elsewhere else, e. g. by a closure.
Instead of original object, the provided functions will obtain the following context as properties of __this__ value:

* __context__ - the API descriptor object you provided.
* __fullUrl__ - the full request URI.
* __parsedFullUrl__ - full request URI parsed by `url.parse` method.
* __req__ - the original Express request.
* __res__ - the original Express request.
* __user__ - the value of `req.user` expression. Can be `undefined`. depending on api descriptor settings.
* __send__ - function that calls `res.send` under the hood.
* __next__ - function that calls the original _next_ callback, provided to middleware by Express.
* __error__ - function that sends a _message_ to client with status code 500.

Deferred results
================

If your functions in API descriptor do something in async way, - call a web service or contact with a database,
 these your functions should return __Q__ promise or something `then`able - that have a `then` method. This method will
 receive 2 callbacks: first one for success, and second one for error case.

Known limitations
=================

Currently API generated with this library returns only what the method `req.send` of Express library can return,
without own content negotiation. So, assume that only JSON can be returned, unless you set properly headers and made 
other setup theExpress needs.










