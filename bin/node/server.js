/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global require, exports */

(function () {
    "use strict";

    var http = require("http");
    var config = require("./config.js");
    var url = require("url");
    
    var server;
    
    var start = function (route, handle) {
        server = http.createServer(
            function (request, response) {
                var pathname = url.parse(request.url).pathname;
                route(handle, pathname, response);
                console.log("Request received : " + pathname);
            }
        
        );
        server.listen(config.HTTP_PORT);
        
        console.log("pizone API service initialized. Listening on port " + config.HTTP_PORT);
    };
    
    var stop = function (onClose) {
        
        if (!server) {
            //should we call onClose here?
            onClose();
            return;
        }
        
        server.close(
            function () {
                server = null;
                onClose();
            }
        );
    };
    
    exports.stop = stop;
    exports.start = start;
    
}());