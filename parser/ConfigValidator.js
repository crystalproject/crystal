var validator = require('jsonschema').Validator;
var range_check = require('range_check');
var nmask = require('netmask').Netmask;
var path = require('path');
var fs = require('fs');

var utilities = require('./ConfigUtilities');


var json;


//
// Parses json file.
//
// Return: json object if successful, null otherwise.
//
function parseFile(fileName) {
    try {
        var content = fs.readFileSync(fileName);
        var j = JSON.parse(content);
    } catch (e) {
        console.error('failed to parse file \'' + fileName + '\': ' + e);
        return null;
    }

    return j;
}

function getFilePath(baseDir, fileName) {
    if (fileName[0] === '/') {
        // fileName is an absolute path, no need to further process it
        return fileName;
    }

    return path.join(baseDir, fileName);
}

//
// Checks if attribute in json contains an object with an 'include' attribute.
// if so, the value is considered a json file, which is parsed into
// an object which replaces the object containing the include attribute.
//
// Return: json object if successful, null otherwise.
//
function replace(baseDir, jsonData, attribute) {

    if (jsonData.hasOwnProperty(attribute)) {
        if (Array.isArray(jsonData[attribute])) {

            for (var i = 0; i < jsonData[attribute].length; i++) {

                var obj = jsonData[attribute][i];
                if (obj.hasOwnProperty('include')) {
                    var includeFile = getFilePath(baseDir, obj.include);
                    var content = parseFile(includeFile);
                    if (!content) {
                        return null;
                    }

                    jsonData[attribute][i] = content;
                }
            }
        } else {

            var obj = jsonData[attribute];
            if (obj.hasOwnProperty('include')) {
                var includeFile = getFilePath(baseDir, obj.include);
                var content = parseFile(includeFile);
                if (!content) {
                    return null;
                }

                jsonData[attribute] = content;
            }
        }
    }
    return jsonData;
}

//
// Validate JSON.
//
// Return: true if valid, false otherwise
//

function parse(fileName) {

    var baseDir = path.dirname(fileName);

    var jsonData = parseFile(fileName);
    if (!jsonData) {
        return null;
    }

    jsonData = replace(baseDir, jsonData, 'segment');
    if (!jsonData) {
        return null;
    }


    if (jsonData.hasOwnProperty('segment')) {
        if (!Array.isArray(jsonData.segment)) {
            console.error('segment must be array');
            return null;
        }
        for (var i = 0; i < jsonData.segment.length; i++) {

            var segment = jsonData.segment[i];
            segment = replace(baseDir, segment, 'host');
            if (!segment) {
                return null;
            }
            segment = replace(baseDir, segment, 'gateway');
            if (!segment) {
                return null;
            }
            jsonData.segment[i] = segment;
        }
    }

    jsonData = replace(baseDir, jsonData, 'event');

    //console.log(JSON.stringify(jsonData));
    return jsonData;
}

//
// Validate JSON.
//
// Return: true if valid, false otherwise
//
function validate(jsonData, eventsOnly) {

    json = jsonData;
    var v = new validator();

    var segmentRequired;
    var segMinItems;
    if (eventsOnly) {
        segmentRequired = false;
        segMinItems = 0;
    } else {
        segmentRequired = true;
        segMinItems = 1;
    }
    // instance
    var schema = {
        'id': '/schema',
        'type': 'object',
        'properties': {
            'base_path': {'type': 'string', 'required': true},
            'image_path': {'type': 'string', 'required': true},
            'event_path': {'type': 'string', 'required': true},
            'output_path': {'type': 'string', 'required': true},
            'segment': {
                'type': 'array',
                'items': {'$ref': '/segment'},
                'required': segmentRequired,
                'minItems': segMinItems
            },
            'event': {'type': 'array', 'items': {'$ref': '/event'}}
        }
    };

    // segment
    var segmentSchema = {
        'id': '/segment',
        'type': 'object',
        'properties': {
            'label': {'type': 'string', 'required': true},
            'net': {'type': 'string', 'required': true},
            'ovswitch': {'type': 'string', 'required': true},
            'pnode': {'type': 'array', 'items': {'type': 'string'}, 'required': true, 'minItems': 1},
            'host': {'type': 'array', 'items': {'$ref': '/host'}, 'required': false, 'minItems': 0},
            'gateway': {'type': 'array', 'items': {'$ref': '/gateway'}},
            'phydev': {'type': 'array', 'items': {'$ref': '/phydev'}, 'required': false}
        }
    };

    // phydev
    var phydevSchema = {
        'id': '/phydev',
        'type': 'object',
        'properties': {
            'pnode': {'type': 'string', 'required': true},
            'dev': {'type': 'string', 'required': true}
        }
    };

    // host
    var hostSchema = {
        'id': '/host',
        'type': 'object',
        'properties': {
            'label': {'type': 'string', 'required': true},
            'ip': {'type': 'array', 'items': {'type': 'string'}, 'required': true, 'minItems': 1},
            'gw': {'type': 'string'},
            'ns': {'type': 'array', 'items': {'type': 'string'}, 'required': false, 'maxItems': 2},
            'os': {'type': 'string', 'required': true},
            'architecture': {'type': 'string', 'required': true},
            'major patch': {'type': 'string', 'required': true},
            'memory': {'type': 'string', 'required': true},
            'keymap': {'type': 'string'},
            'pnode': {'type': 'string'},
            'service': {'type': 'array', 'items': {'$ref': '/service'}},
            'event': {'type': {'$ref': '/event'}}
        }
    };

    // gateway
    var gatewaySchema = {
        'id': '/gateway',
        'type': 'object',
        'properties': {
            'label': {'type': 'string', 'required': true},
            'ipin': {'type': 'string', 'required': true},
            'ipout': {'type': 'string', 'required': true},
            'ns': {'type': 'array', 'items': {'type': 'string'}, 'maxItems': 2},
            'os': {'type': 'string', 'required': true},
            'architecture': {'type': 'string', 'required': true},
            'major patch': {'type': 'string', 'required': true},
            'memory': {'type': 'string', 'required': true},
            'keymap': {'type': 'string'},
            'pnode': {'type': 'string'},
            'service': {'type': 'array', 'items': {'$ref': '/service'}},
            'iptables': {'type': 'array', 'items': {'$ref': '/iptable'}}
        }
    };


    // service
    var serviceSchema = {
        'id': '/service',
        'type': 'object',
        'properties': {
            'label': {'type': 'string', 'required': true},
            'serviceconf': {
                'type': 'array',
                'items': {'type': 'object'}
            }
        }
    };


    var iptableSchema = {
        'id': '/iptable,',
        'type': 'object',
        'properties': {
            'inport': {'type': 'integer', 'required': true},
            'outport': {'type': 'integer', 'required': true},
            'dst': {'type': 'string', 'required': true}
        }
    };

    var eventSchema = {
        'id': '/event,',
        'type': 'object',
        'properties': {
            'label': {'type': 'string', 'required': true},
            'executor': {'type': 'string'},
            'destination': {'type': 'string'},
            'description': {'type': 'string'},
            'time': {'type': 'array', 'items': {'type': 'string'}},
            'absoluteTime': {'type': 'array', 'items': {'type': 'string'}},
            'src': {'type': 'string', 'required': true},
            'action': {'type': 'array', 'items': {'$ref': '/service'}, 'minItems': 1}
        }
    };

    var actionSchema = {
        'id': '/action,',
        'type': 'object',
        'properties': {
            'label': {'type': 'string', 'required': true},
            'version': {'type': 'string'},
            'score': {'type': 'array', 'items': {'$ref': '/score'}},
            'command': {'type': 'string'}
        }
    };

    var scoreSchema = {
        'id': '/score,',
        'type': 'object',
        'properties': {
            'label': {'type': 'string', 'required': true},
            'command': {'type': 'string', 'required': true},
            'condition': {'type': 'string', 'required': true},
            'team': {'type': 'array', 'items': {'type': 'string'}, 'minItems': 1},
            'weight': {'type': 'integer', 'required': true}
        }
    };


    v.addSchema(segmentSchema, '/segment');
    v.addSchema(hostSchema, '/host');
    v.addSchema(gatewaySchema, '/gateway');
    v.addSchema(serviceSchema, '/service');
    v.addSchema(iptableSchema, '/iptable');
    v.addSchema(eventSchema, '/event');
    v.addSchema(actionSchema, '/action');
    v.addSchema(scoreSchema, '/score');
    v.addSchema(phydevSchema, '/phydev');

    // perform jsonschema validation
    var result = v.validate(json, schema);

    if (!result.valid) {
        var str = 'configuration file is not valid:\n';
        result.errors.forEach(function (error) {
            str = str + error + '\n';
        });
        console.error(str);
        return false;
    }

    // run additional validation

    if (utilities.isNullOrEmpty(json.base_path)) {
        console.error('base_path must not be null or empty');
        return false;
    }

    if (utilities.isNullOrEmpty(json.image_path)) {
        console.error('image_path must not be null or empty');
        return false;
    }

    if (utilities.isNullOrEmpty(json.event_path)) {
        console.error('event_path must not be null or empty');
        return false;
    }

    if (utilities.isNullOrEmpty(json.output_path)) {
        console.error('output_path must not be null or empty');
        return false;
    }


    var status = true;
    if (json.hasOwnProperty('segment')) {
        json.segment.every(function (segment) {

            if (!validateSegment(segment)) {
                status = false;
            }
            return status;
        });
    }

    if (!status) {
        return status;
    }

    //host.label, gateway.label must be unique
    if (!labelsUnique()) {
        return false;
    }

    // validate ip addresses
    if (!validateIpAddresses()) {
        return false;
    }

    if (json.hasOwnProperty('event')) {
        json.event.every(function (event) {
            if (!validateEvent(event)) {
                status = false;
                return false;
            }
        })
    }
    return status;
}

//
// Validates host's ips and gateway's ipin an ipout:
// they must be unique
//
// Return: object with ip addresses if valid, null otherwise.
//
function validateIpAddresses() {
    var ipAddresses = {};
    if (json.hasOwnProperty('segment')) {
        json.segment.forEach(function (segment) {
            if (segment.hasOwnProperty('host')) {
                segment.host.forEach(function (host) {
                    if (host.hasOwnProperty('ip')) {
                        host.ip.forEach(function (ip) {
                            if (ipAddresses[ip]) {
                                console.error('multiple entries for ip address ' + ip);
                                return null;
                            }
                            ipAddresses[ip] = ip;

                        });
                    }
                });
            }
            if (segment.hasOwnProperty('gateway')) {
                segment.gateway.forEach(function (gateway) {
                    if (ipAddresses[gateway.ipin]) {
                        console.error('multiple entries for ip address ' + gateway.ipin);
                        return null;
                    }
                    ipAddresses[gateway.ipin] = gateway.ipin;

                    if (ipAddresses[gateway.ipout]) {
                        console.error('multiple entries for ip address ' + gateway.ipout);
                        return null;
                    }
                    ipAddresses[gateway.ipout] = gateway.ipout;

                })
            }
        });
    }
    return ipAddresses;
}

//
// Checks if all host and gateway labels are unique.
//
// Return: true if unique, false otherwise
function labelsUnique() {

    var labels = {};

    var status = true;
    if (json.hasOwnProperty('segment')) {
        json.segment.every(function (segment) {

            if (segment.hasOwnProperty('host')) {
                segment.host.every(function (host) {
                    if (labels[host.label]) {
                        console.error('host label ' + host.label + ' is not unique');
                        status = false;
                    } else {
                        labels[host.label] = host.label;
                    }
                    return status;
                });
            }
            if (!status) {
                return status;
            }
            if (segment.hasOwnProperty('gateway')) {
                segment.gateway.every(function (gateway) {
                    if (labels[gateway.label]) {
                        console.error('gateway label ' + gateway.label + ' is not unique');
                        status = false;
                    } else {
                        labels[gateway.label] = gateway.label;
                    }
                    return status;

                });
            }
            return status;
        });
    }

    return status;
}

//
// Validates segment.
//
// Return: true if valid, false otherwise
//
function validateSegment(segment) {

    if (utilities.isNullOrEmpty(segment.label)) {
        console.error('segment label must not be null or empty');
        return false;
    }

    if (utilities.isNullOrEmpty(segment.net)) {
        console.error('segment \"' + segment.label + '\": net must not be null or empty');
        return false;
    }

    try {
        var block = new nmask(segment.net);
    } catch (ex) {
        console.error('segment \"' + segment.label + '\": net is not a CIDR:' + segment.net);
        return false;
    }

    if (utilities.isNullOrEmpty(segment.ovswitch)) {
        console.error('segment \"' + segment.label + '\": ovswitch must not be null or empty');
        return false;
    }

    if (segment.ovswitch.length > 16) {
        console.error('segment \"' + segment.label + '\": ovswitch (\'' + segment.ovswitch + '\' must not be longer than 16 characters');
        return false;
    }

    if (segment.hasOwnProperty('host')) {
        var status = true;
        segment.host.every(function (host) {
            if (!validateHost(segment, host)) {
                status = false;
            }
            return status;
        });

        if (!status) {
            return false;
        }
    }

    if (segment.hasOwnProperty('gateway')) {

        var status = true;
        segment.gateway.every(function (gateway) {
            if (!validateGateway(segment, gateway)) {
                status = false;
            }
            return status;
        });
        if (!status) {
            return false;
        }
    }

    return true;
}

//
// Validates key map
//
// Return: true if valid, false otherwise
//
function validateKeyMap(keymap) {
    if (utilities.isNullOrEmpty(keymap)) {
        return true;
    }
    switch (keymap) {
        case 'ar':
        case 'bepo':
        case 'common':
        case 'cz':
        case 'da':
        case 'de':
        case 'de-ch':
        case 'en-gb':
        case 'en-us':
        case 'es':
        case 'et':
        case 'fi':
        case 'fo':
        case 'fr':
        case 'fr-be':
        case 'fr-ca':
        case 'fr-ch':
        case 'hr':
        case 'hu':
        case 'is':
        case 'it':
        case 'ja':
        case 'lt':
        case 'lv':
        case 'mk':
        case 'nl':
        case 'nl-be':
        case 'no':
        case 'pl':
        case 'pt':
        case 'pt-br':
        case 'ru':
        case 'sl':
        case 'sv':
        case 'th':
        case 'tr':
            return true;
        default:
            return false;
    }
}

//
// Validates host.
//
// Return: true if valid, false otherwise
//
function validateHost(segment, host) {

    if (utilities.isNullOrEmpty(host.label)) {
        console.error('host label must not be null or empty');
        return false;
    }

    if (!validateKeyMap(host.keymap)) {
        console.error('host \"' + host.label + '\": invalid key map ' + host.keymap);
        return false;
    }
    if (host.hasOwnProperty('ip')) {
        var status = true;
        var ipInOwnSegmentCidr = false;
        host.ip.every(function (ip) {
            if (!isValidIp(ip)) {
                console.error('host \"' + host.label + '\": ip is not valid');
                status = false;
                return status;
            }

            if (utilities.isIpInRange(ip, segment.net)) {
                // ip is in own segment's cidr range
                ipInOwnSegmentCidr = true;
                return status;
            } else {

                // check if ip is in any other segment's cidr range and host's pnode is in other segment's pnode array
                var found = false;
                if (json.hasOwnProperty('segment')) {
                    json.segment.every(function (seg) {
                        if (utilities.isIpInRange(ip, seg.net)) {
                            if (!utilities.isNullOrEmpty(host.pnode)) {
                                // host's pnode must be one of seg's pnodes
                                if (seg.hasOwnProperty('pnode')) {
                                    seg.pnode.every(function (pn) {
                                        if (host.pnode === pn) {
                                            found = true;
                                            return false;
                                        }
                                    });
                                }
                            }
                            if (found) {
                                return false;
                            }

                        } else {
                            return true;
                        }
                    });
                }
                if (!found) {
                    console.error('host \"' + host.label + '\": ip \"' + ip + '\" is not in any segment\'s cidr range or host\'s pnode is not in segment\'s pnodes');
                    status = false;
                }
                return status;
            }
        });

        if (!status) {
            return false;
        }

        if (!ipInOwnSegmentCidr) {
            // at least one ip must be in own segment's cidr range
            console.error('host \"' + host.label + '\" has no ip which is in segment\'s cidr range: ' + segment.net);
            return false;
        }
    }

    if (utilities.isNullOrEmpty(host.os)) {
        console.error('host \"' + host.label + '\": template must not be null or empty');
        return false;
    }

    if (!validatePnode(segment, host)) {
        return false;
    }

    return true;
}

//
// Validates host/gateway's pnode.
//
//
function validatePnode(segment, host) {

    if (!utilities.isNullOrEmpty(host.pnode)) {
        // if pnode is set it must exist in the segment's pnode array.
        var found = false;
        if (segment.hasOwnProperty('pnode')) {
            segment.pnode.every(function (pnode) {
                if (pnode === host.pnode) {
                    found = true;
                    return false;
                } else {
                    return true;
                }
            });
        }

        if (!found) {
            // didn't find host/gateway's pnode in segment's pnode array
            console.error('host/gateway \"' + host.label + '\": did not found pnode \"' + host.pnode + '\" in segment\'s pnode array');
            return false;
        }

    } else {
        // pnode must not be null if segment has multiple pnodes.
        if (segment.hasOwnProperty('pnode') && segment.pnode.length > 1) {
            // pnode must not be null or empty, if segment.pnode has multiple definitions
            console.error('host/gateway \"' + host.label + '\": pnode must not be null or empty, if segment.pnode has multiple definitions');
            return false;
        }
    }

    return true;
}

//
// Validates gateway.
//
// Return: true if valid, false otherwise
//
function validateGateway(segment, gateway) {

    if (utilities.isNullOrEmpty(gateway.label)) {
        console.error('gateway label must not be null or empty');
        return false;
    }

    if (!isValidIp(gateway.ipin)) {
        console.error('gateway \"' + gateway.label + '\": ipin is not valid');
        return false;
    }

    if (!isValidIp(gateway.ipout)) {
        console.error('gateway \"' + gateway.label + '\": ipout is not valid');
        return false;
    }

    if (!validatePnode(segment, gateway)) {
        return false;
    }
    if (!validateKeyMap(gateway.keymap)) {
        console.error('host \"' + gateway.label + '\": invalid keyMap ' + gateway.keymap);
        return false;
    }

    if (gateway.hasOwnProperty('iptables')) {
        var status = true;
        gateway.iptables.every(function (iptable) {
            if (!validateIpTable(iptable)) {
                status = false;
            }

            return status;
        });
        if (!status) {
            return false;
        }
    }
    return true;
}

//
// Validates iptable.
//
// Return true if valid, false otherwise
//
function validateIpTable(iptable) {

    var inport = iptable.inport;
    if (!parseInt(inport, 10) || inport < 0 || inport > 65535) {
        console.error('iptable \"' + iptable.label + '\": inport is not valid');
        return false;
    }

    var outport = iptable.outport;
    if (!parseInt(outport, 10) || outport < 0 || outport > 65535) {
        console.error('iptable \"' + iptable.label + '\": outport is not valid');
        return false;
    }

    if (!isValidIp(iptable.dst)) {
        console.error('iptable \"' + iptable.label + '\": dst is not valid');
        return false;
    }

    return true;
}

//
// Validates event.
//
// Return true if valid, false otherwise.
//
function validateEvent(event) {

    var status = true;

    if (utilities.isNullOrEmpty(event.label)) {
        console.error('event label must not be null or empty');
        return false;
    }

    if (!event.hasOwnProperty('time') && !event.hasOwnProperty('absoluteTime')) {
        console.error('event ' + event.label + ' has no time or absoluteTime specified');
        return false;
    }


    if (event.hasOwnProperty('time')) {
        event.time.every(function (time) {
            if (!validateEventRelativeTime(time)) {
                console.error('event ' + event.label + ': invalid time: ' + time);
                status = false;
            }
            return status;
        });
    }

    if (event.hasOwnProperty('absoluteTime')) {
        event.absoluteTime.every(function (time) {
            if (!validateEventAbsoluteTime(time)) {
                console.error('event ' + event.label + ': invalid absoluteTime: ' + time);
                status = false;
            }
            return status;
        });
    }


    if (!status) {
        return false;
    }

    if (event.hasOwnProperty('action')) {
        event.action.every(function (action) {
            if (utilities.isNullOrEmpty(event.label)) {
                console.error('action label must not be null or empty');
                status = false;
                return status;
            }
            if (action.hasOwnProperty('score')) {
                action.score.every(function (score) {
                    if (utilities.isNullOrEmpty(score.label)) {
                        console.error('score label must not be null or empty');
                        status = false;
                        return status;
                    }

                    return status;
                });
            }

            return status;
        });
    }

    return status;
}

//
// Validates event time
//
// Return object if valid, null otherwise.
//
function validateEventRelativeTime(time) {

    // time must match pattern <hours>h<minutes>m<seconds>s

    var chars = ['h', 'm', 's'];

    var hours = 0;
    var minutes = 0;
    var seconds = 0;

    var idx0 = 0;
    var idx1 = 0;

    for (var i = 0; i < chars.length; i++) {
        idx1 = time.indexOf(chars[i]);
        if (idx1 != -1) {
            var str = time.substring(idx0, idx1);
            var val = parseInt(str);
            if (isNaN(val)) {
                console.error('invalid format of time: ' + time);
                return null;
            }
            switch (chars[i]) {
                case 'h':
                    hours = val;
                    break;
                case 'm':
                    minutes = val;
                    break;
                case 's':
                    seconds = val;
                    break;
                default:
                    break;
            }

            idx0 = idx1 + 1;
        }
    }

    return {hours: hours, minutes: minutes, seconds: seconds};
}

//
// Checks if time is a valid date/time string
//
// Returns Date object if valid, null otherwise
//
function validateEventAbsoluteTime(time) {

    var d = new Date(time);
    if (isNaN(d.getTime())) {
        return null;
    } else {
        return d;
    }
}

//
// Checks if  IP address is valid.
//
// Return: true if valid, false otherwise
//
function isValidIp(ip) {
    if (!ip) {
        return false;
    }
    var ipStr = ip.toString();
    if (!ipStr) {
        return false;
    }

    // range_check seems to accept only string
    return range_check.vaild_ip(ipStr);
}


exports.parse = parse;
exports.validate = validate;
exports.validateIpAddresses = validateIpAddresses;
exports.validateEventRelativeTime = validateEventRelativeTime;
exports.validateEventAbsoluteTime = validateEventAbsoluteTime;
