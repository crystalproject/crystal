var util = require('util');
var range_check = require('range_check');
var validator = require('jsonschema').Validator;

//
// Validate JSON.
//
// Return: true if valid, false otherwise
//
var validate = function (jsonRoot) {

    var v = new validator();

    // root
    var schema = {
        'id': '/schema',
        'type': 'object',
        'properties': {
            'base_path': {'type': 'string', 'required': true},
            'image_path': {'type': 'string', 'required': true},
            'event_path': {'type': 'string', 'required': true},
            'output_path': {'type': 'string', 'required': true},
            'segment': {'type': 'array', 'items': {'$ref': '/segment'}, 'required': true, 'minItems': 1}
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
            'host': {'type': 'array', 'items': {'$ref': '/host'}, 'required': true, 'minItems': 0},
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
            'template': {'type': 'string', 'required': true},
            'pnode': {'type': 'string'},
            'service': {'type': 'array', 'items': {'$ref': '/service'}}
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
            'linkto': {'type': 'string', 'required': true},
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
            'label': {'type': 'string', 'required': true},
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
            'src': {'type': 'array', 'items': {'type': 'string'}, 'required': true, 'minItems': 1},
            'dst': {'type': 'array', 'items': {'type': 'string'}, 'required': true, 'minItems': 1},
            'action': {'type': 'object'}
        }
    }

    v.addSchema(segmentSchema, '/segment');
    v.addSchema(hostSchema, '/host');
    v.addSchema(gatewaySchema, '/gateway');
    v.addSchema(serviceSchema, '/service');
    v.addSchema(iptableSchema, '/iptable');
    v.addSchema(eventSchema, '/event');

    // perform jsonschema validation
    var result = v.validate(jsonRoot, schema);

    if (!result.valid) {
        var str = 'configuration file is not valid:\n';
        result.errors.forEach(function (error) {
            str = str + error + '\n';
        });
        console.error(str);
        return false;
    }

    // run additional validation

    if (isNullOrEmpty(jsonRoot['base_path'])) {
        console.error('base_path must not be null or empty');
        return false;
    }

    if (isNullOrEmpty(jsonRoot['image_path'])) {
        console.error('image_path must not be null or empty');
        return false;
    }

    if (isNullOrEmpty(jsonRoot['event_path'])) {
        console.error('event_path must not be null or empty');
        return false;
    }

    if (isNullOrEmpty(jsonRoot['output_path'])) {
        console.error('output_path must not be null or empty');
        return false;
    }

    jsonRoot['segment'].forEach(function (segment) {

        if (!validateSegment(segment)) {
            return false;
        }
    });

    return true;
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

    if (isNullOrEmpty(segment['ovswitch'])) {
        console.error('segment \"' + segment['label'] + '\": ovswitch must not be null or empty');
        return false;
    }

    segment['host'].forEach(function (host) {
        if (!validateHost(segment, host)) {
            return false;
        }
    });

    if (segment.hasOwnProperty('gateway')) {

        segment['gateway'].forEach(function (gateway) {
            if (!validateGateway(segment, gateway)) {
                return false;
            }
        });
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

    host['ip'].forEach(function (ip) {
        if (!isValidIp(ip)) {
            console.error('host \"' + host['label'] + '\": ip is not valid');
            return false;
        }

        if (!isInRange(ip, segment['net'])) {
            console.error('host \"' + host['label'] + '\": ip \"' + ip + '\" is not in segment\'s cidr range');
            return false;
        }
    });

    if (isNullOrEmpty(host['template'])) {
        console.error('host \"' + host['label'] + '\": template must not be null or empty');
        return false;
    }

    if (segment['pnode'].length > 1 && isNullOrEmpty(host['pnode'])) {
        console.error('host \"' + host['label'] + '\": pnode must not be null or empty, if segment.pnode has multiple definitions');
        return false;
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

    if (isNullOrEmpty(gateway['linkto'])) {
        console.error('gateway \"' + gateway['label'] + '\": linkto must not be null or empty');
        return false;
    }

    if (segment['pnode'].length > 1 && isNullOrEmpty(gateway['pnode'])) {
        console.error('gateway \"' + gateway['label'] + '\": pnode must not be null or empty, if segment.pnode has multiple definitions');
        return false;
    }

    if (gateway.hasOwnProperty('iptables')) {
        gateway['iptables'].forEach(function (iptable) {
            if (!ValidateIpTable(gateway, iptable)) {
                return false;
            }
        });
    }
    return true;
}

//
//
//
//
function ValidateIpTable(gateway, iptable) {

    if (isNullOrEmpty(iptable['label'])) {
        console.error('iptable label must not be null or empty');
        return false;
    }

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

    if (!isValidIp(iptable['destination'])) {
        console.error('iptable \"' + iptable['label'] + '\": destination is not valid');
        return false;
    }

    return true;
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
var isInRange = function (ip, cidr) {
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

}

module.exports = {
    validate: validate,
    isInRange: isInRange
}
