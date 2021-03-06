/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50, continue: true */
/*global require, exports */

(function () {
    "use strict";
    
    var async = require("async");
    var process_runner = require("./process_runner.js");
    var config = require("./config.js");
    var utils = require("./utils.js");
    var fs = require("fs");
    var os = require("os");
    var conffile = require("./conffile.js");
    var hostapdconf = require("./hostapdconf.js");
    var winston = require("./logger").winston;
    
    var formatTempOutput = function (temp) {
        
        temp = temp / 1000;
        var out = {};
        
        if (!config.USE_CELCIUS) {
            temp = utils.celsiusToFarenheit(temp);
        }
        
        temp = Math.ceil(temp);
        
        out.cpuTemp = temp;
        out.tempScale = (config.USE_CELCIUS) ? "celcius" : "farenheit";
        
        return out;
    };
    
	var getCPUTemp = function (callback) {
	
        var out = {};
		var tmp;
		if (config.TEST) {
			tmp = 54072;

            out = formatTempOutput(tmp);
            callback(null, out);
			return;
		}
		
		fs.readFile("/sys/class/thermal/thermal_zone0/temp", {encoding: "ascii"},
			function (err, data) {
				if (err) {
                    winston.error("Error Reading System Temp");
                    winston.error(err);
					callback(err);
					return;
                }
                
                //todo: this is wrong
				tmp = parseInt(data, 10); //convert to number
                out = formatTempOutput(tmp);
                
				callback(null, out);
			});
	};
	
	var getGPUTemp = function (callback) {
	};

    var restartUDHCPD = function (callback) {
        //service udhcpd restart 2>&1 >/dev/null
        process_runner.exec("service", ["udhcpd", "restart"], callback);
    };

    var restartAPD = function (callback) {
        //service hostapd restart 2>&1 >/dev/null
        process_runner.exec("service", ["hostapd", "restart"], callback);
    };
    
    var readRestrictedAccessList = function (callback) {
        fs.readFile(config.HOSTAPD_RESTRICTED_ADDRESSES_PATH,
                    {encoding: "utf8"},
            function (err, data) {
                var addresses = data.split(os.EOL);
                callback(null, addresses);
            }
            );
    };
    
    var saveRestrictedAccessList = function (addresses, callback) {
        var tmp = addresses.join(os.EOL);
        fs.writeFile(config.HOSTAPD_RESTRICTED_ADDRESSES_PATH, tmp, callback);
    };
    
    var updateRestrictedAccessList = function (addresses, callback) {
        //todo: confirm whether we need to restart service after updating access list
        async.series(
            [
                function (callback) {saveRestrictedAccessList(addresses, callback); },
                restartAPD
            ],
            function (err, out) {
                if (err) {
                    callback(err);
                    return;
                }
                callback(null, out);
            }
        );
    };
    
    var formatAsyncOutput = function (arr) {
    
        if (!arr) {
            return;
        }
        
        var out = [];
        
        var len = arr.length;
        
        var tmp, i;
        for (i = 0; i < len; i++) {
            tmp = arr[i];
            
            if (!tmp) {
                continue;
            }
            
            out.push(tmp.trim());
        }
        
        return out.join(os.EOL);
    };
    
    var updateAPConf = function (ssid, callback) {
        
        var _generateAPConf = function (data, callback) {
            var conf = hostapdconf.updateSSID(ssid, data);
            callback(null, conf);
        };
        
        //todo: do we need to restart restartUDHCPD (it is slow)
        async.waterfall(
            [
                hostapdconf.loadConfFile,
                _generateAPConf,
                hostapdconf.writeConfFile
            ],
            function (err, out) {
                out = formatAsyncOutput(out);
                
                //note: if not an error, err will be null
                callback(err, out);
            }
        );
    };
    
    var updateAccessPoint = function (ssid, address, callback) {
        
        if (!utils.isValidMacAddress(address)) {
            callback("Invalid mac address");
            return;
        }
        
        if (!ssid || !ssid.length) {
            callback("Invalid SSID.");
            return;
        }
        
        //note, the arguments are not passed on the shell, so we don't have to worry
        //about injection (although the script being called does)
        //http://stackoverflow.com/questions/15168071/how-secure-is-using-execfile-for-bash-scripts
        async.series(
            [
                function (callback) {process_runner.exec("ifconfig", [config.ACCESS_POINT_INTERFACE, "down"], callback); },
                function (callback) {process_runner.exec("ifconfig", [config.ACCESS_POINT_INTERFACE, "hw", "ether", address], callback); },
                function (callback) {process_runner.exec("ifconfig", [config.ACCESS_POINT_INTERFACE, "up"], callback); },
                function (callback) {updateAPConf(ssid, callback); },
                restartAPD//,
                
            ],
            function (err, out) {
                out = formatAsyncOutput(out);
                
                //note: if not an error, err will be null
                callback(err, out);
            }
        );
    };
    
    exports.getCPUTemp = getCPUTemp;
    exports.updateAccessPoint = updateAccessPoint;
}());