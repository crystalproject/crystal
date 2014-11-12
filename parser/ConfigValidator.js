var range_check = require('range_check');
var validator = require('jsonschema').Validator;

var json;
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
    if (eventsOnly){
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
            'segment': {'type': 'array', 'items': {'$ref': '/segment'}, 'required': segmentRequired, 'minItems': segMinItems},
            'event': {'type': 'array', 'items': {'$ref': '/event'}}
        }
    }

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
            'gateway': {'type': 'array', 'items': {'$ref': '/gateway'}}
        }
    }

    // host
    var hostSchema = {
        'id': '/host',
        'type': 'object',
        'properties': {
            'label': {'type': 'string', 'required': true},
            'ip': {'type': 'array', 'items': {'type': 'string'}, 'required': true, 'minItems': 1},
            'gw': {'type': 'string'},
            'ns': {'type': 'array', 'items': {'type': 'string'}, 'required': true, 'maxItems': 2},
            'os': {'type': 'string', 'required': true},
            'architecture': {'type': 'string', 'required': true},
            'major patch': {'type': 'string', 'required': true},
            'memory': {'type': 'string', 'required': true},
            'pnode': {'type': 'string'},
            'service': {'type': 'array', 'items': {'$ref': '/service'}},
            'event': {'type': {'$ref': '/event'}}
        }
    }

    // gateway
    var gatewaySchema = {
        'id': '/gateway',
        'type': 'object',
        'properties': {
            'label': {'type': 'string', 'required': true},
            'ipin': {'type': 'string', 'required': true},
            'ipout': {'type': 'string', 'required': true},
            'os': {'type': 'string', 'required': true},
            'architecture': {'type': 'string', 'required': true},
            'major patch': {'type': 'string', 'required': true},
            'memory': {'type': 'string', 'required': true},
            'pnode': {'type': 'string'},
            'service': {'type': 'array', 'items': {'$ref': '/service'}},
            'iptables': {'type': 'array', 'items': {'$ref': '/iptable'}}
        }
    }


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
    }


    var iptableSchema = {
        'id': '/iptable,',
        'type': 'object',
        'properties': {
            'inport': {'type': 'integer', 'required': true},
            'outport': {'type': 'integer', 'required': true},
            'dst': {'type': 'string', 'required': true}
        }
    }

    var eventSchema = {
        'id': '/event,',
        'type': 'object',
        'properties': {
            'label': {'type': 'string', 'required': true},
            'time': {'type': 'array', 'items': {'type': 'string'}, 'required': true, 'minItems': 1},
            'src': {'type': 'string', 'required': true},
            'action': {'type': 'array', 'items': {'$ref': '/service'}, 'minItems': 1}
        }
    }

    var actionSchema = {
        'id': '/action,',
        'type': 'object',
        'properties': {
            'label': {'type': 'string', 'required': true},
            'version': {'type': 'string'},
            'score': {'type': 'array', 'items': {'$ref': '/score'}},
            'command': {'type': 'string'}
        }
    }

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
    }


    v.addSchema(segmentSchema, '/segment');
    v.addSchema(hostSchema, '/host');
    v.addSchema(gatewaySchema, '/gateway');
    v.addSchema(serviceSchema, '/service');
    v.addSchema(iptableSchema, '/iptable');
    v.addSchema(eventSchema, '/event');
    v.addSchema(actionSchema, '/action');
    v.addSchema(scoreSchema, '/score');

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

    if (isNullOrEmpty(json['base_path'])) {
        console.error('base_path must not be null or empty');
        return false;
    }

    if (isNullOrEmpty(json['image_path'])) {
        console.error('image_path must not be null or empty');
        return false;
    }

    if (isNullOrEmpty(json['event_path'])) {
        console.error('event_path must not be null or empty');
        return false;
    }

    if (isNullOrEmpty(json['output_path'])) {
        console.error('output_path must not be null or empty');
        return false;
    }


    var status = true;
    if (json.hasOwnProperty('segment')) {
        json['segment'].every(function (segment) {

            if (!validateSegment(segment)) {
                status = false;
            }
            return status;
        });
    }

    if (!status) {
        return status;
    }

    //host.label, gateway label must be unique
    if (!labelsUnique()) {
        return false;
    }


    if (json.hasOwnProperty('event')) {
        json['event'].every(function (event) {
            if (!validateEvent(event)) {
                return false;
            }
        })
    }
    return status;
}

//
// Checks if all host and gateway labels are unique.
//
// Return: true if unique, false otherwise
function labelsUnique() {

    var labels = {};

    var status = true;
    if (json.hasOwnProperty('segment')) {
        json['segment'].every(function (segment) {

            if (segment.hasOwnProperty('host')) {
                segment['host'].every(function (host) {
                    if (labels[host['label']]) {
                        console.error('host label ' + host['label'] + ' is not unique');
                        status = false;
                    } else {
                        labels[host['label']] = host['label'];
                    }
                    return status;
                });
            }
            if (!status) {
                return status;
            }
            if (segment.hasOwnProperty('gateway')) {
                segment['gateway'].every(function (gateway) {
                    if (labels[gateway['label']]) {
                        console.error('gateway label ' + gateway['label'] + ' is not unique');
                        status = false;
                    } else {
                        labels[gateway['label']] = gateway['label'];
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

    if (isNullOrEmpty(segment['label'])) {
        console.error('segment label must not be null or empty');
        return false;
    }

    if (isNullOrEmpty(segment['net'])) {
        console.error('segment \"' + segment['label'] + '\": net must not be null or empty');
        return false;
    }

    if (segment['net'].indexOf('/') == -1) {
        console.error('segment \"' + segment['label'] + '\": net is not a CIDR:' + segment['net']);
        return false;
    }

    if (isNullOrEmpty(segment['ovswitch'])) {
        console.error('segment \"' + segment['label'] + '\": ovswitch must not be null or empty');
        return false;
    }

    if (segment['ovswitch'].length > 16) {
        console.error('segment \"' + segment['label'] + '\": ovswitch (\'' + segment['ovswitch'] + '\' must not be longer than 16 characters');
        return false;
    }

    if (segment.hasOwnProperty('host')) {
        var status = true;
        segment['host'].every(function (host) {
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
        segment['gateway'].every(function (gateway) {
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
// Validates host.
//
// Return: true if valid, false otherwise
//
function validateHost(segment, host) {

    if (isNullOrEmpty(host['label'])) {
        console.error('host label must not be null or empty');
        return false;
    }

    if (host.hasOwnProperty('ip')) {
        var status = true;
        var ipInOwnSegmentCidr = false;
        host['ip'].every(function (ip) {
            if (!isValidIp(ip)) {
                console.error('host \"' + host['label'] + '\": ip is not valid');
                status = false;
                return status;
            }

            if (isIpInRange(ip, segment['net'])) {
                // ip is in own segment's cidr range
                ipInOwnSegmentCidr = true;
                return status;
            } else {

                // check if ip is in any other segment's cidr range and host's pnode is in other segment's pnode array
                var found = false;
                if (json.hasOwnProperty('segment')) {
                    json['segment'].every(function (seg) {
                        if (isIpInRange(ip, seg['net'])) {
                            if (!isNullOrEmpty(host['pnode'])) {
                                // host's pnode must be one of seg's pnodes
                                if (seg.hasOwnProperty('pnode')) {
                                    seg['pnode'].every(function (pn) {
                                        if (host['pnode'] === pn) {
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
                    console.error('host \"' + host['label'] + '\": ip \"' + ip + '\" is not in any segment\'s cidr range or host\'s pnode is not in segment\'s pnodes');
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
            console.error('host \"' + host['label'] + '\" has no ip which is in segment\'s cidr range: ' + segment['net']);
            return false;
        }
    }

    if (isNullOrEmpty(host['os'])) {
        console.error('host \"' + host['label'] + '\": template must not be null or empty');
        return false;
    }

    if (!validatePnode(segment, host)) {
        return false;
    }

    return true;
}

function validatePnode(segment, host) {

    if (!isNullOrEmpty(host['pnode'])) {
        var found = false;
        if (segment.hasOwnProperty('pnode')) {
            segment['pnode'].every(function (pnode) {
                if (pnode === host['pnode']) {
                    found = true;
                    return false;
                } else {
                    return true;
                }
            });
        }

        if (!found) {
            // didn't find host/gateway's pnode in segment's pnode array
            console.error('host/gateway \"' + host['label'] + '\": did not found pnode \"' + host['pnode'] + '\" in segment\'s pnode array');
            return false;
        }

    } else {

        if (segment.hasOwnProperty('pnode') && segment['pnode'].length > 1) {
            // pnode must not be null or empty, if segment.pnode has multiple definitions
            console.error('host/gateway \"' + host['label'] + '\": pnode must not be null or empty, if segment.pnode has multiple definitions');
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

    if (isNullOrEmpty(gateway['label'])) {
        console.error('gateway label must not be null or empty');
        return false;
    }

    if (!isValidIp(gateway['ipin'])) {
        console.error('gateway \"' + gateway['label'] + '\": ipin is not valid');
        return false;
    }

    if (!isValidIp(gateway['ipout'])) {
        console.error('gateway \"' + gateway['label'] + '\": ipout is not valid');
        return false;
    }

    if (!validatePnode(segment, gateway)) {
        return false;
    }

    if (gateway.hasOwnProperty('iptables')) {
        var status = true;
        gateway['iptables'].every(function (iptable) {
            if (!validateIpTable(gateway, iptable)) {
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
//
//
//
function validateIpTable(gateway, iptable) {

    var inport = iptable['inport'];
    if (!parseInt(inport, 10) || inport < 0 || inport > 65535) {
        console.error('iptable \"' + iptable['label'] + '\": inport is not valid');
        return false;
    }

    var outport = iptable['outport'];
    if (!parseInt(outport, 10) || outport < 0 || outport > 65535) {
        console.error('iptable \"' + iptable['label'] + '\": outport is not valid');
        return false;
    }

    if (!isValidIp(iptable['dst'])) {
        console.error('iptable \"' + iptable['label'] + '\": dst is not valid');
        return false;
    }

    return true;
}

function validateEvent(event) {
    if (isNullOrEmpty(event ['label'])) {
        console.error('event label must not be null or empty');
        return false;
    }

    if (event.hasOwnProperty('action')) {
        event['action'].every(function (action) {

        });
    }
}

//
// Checks if valid IP address
//
// Return: true if valid, false otherwise
//
function isValidIp(ip) {
    if (!ip) {
        return false;
    }
    ipStr = ip.toString();
    if (!ipStr) {
        return false;
    }

    // range_check seems to accept only string
    return range_check.vaild_ip(ipStr);
}


//
//
//
//
function isNullOrEmpty(str) {
    return str == null || str.length == 0;
}

//
// Checks if ip is in cidr's range
//
// Return: true if in range, false otherwise
//
function isIpInRange(ip, cidr) {
    if (!ip || !cidr) {
        return false;
    }
    var ipStr = ip.toString();
    var cidrStr = cidr.toString();

    if (!ipStr || !cidrStr) {
        return false;
    }

    // range_check seems to accept only strings
    return range_check.in_range(ipStr, cidrStr);
    r

}

exports.validate = validate;
exports.isIpInRange = isIpInRange;
exports.isNullOrEmpty = isNullOrEmpty;