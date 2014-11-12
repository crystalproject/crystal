var sh = require('shelljs');
var util = require('util');
var path = require('path');
var os = require('os');
var fs = require('fs');
var mkdirp = require('mkdirp');
var sqlite3 = require('sqlite3');
var nmask = require('netmask').Netmask;


var validator = require('./ConfigValidator');
var stage = require('./ConfigStage');


var EOL = os.EOL;
var WINEOL = '\r\n';
var FILEFLAG = 'w';


var DB_NAME = 'malware.db';


var WINDOWS_TEMPLATE =
    'SET LANCON=%s' + WINEOL +
    'SET SRVROLE=%s' + WINEOL +
    'SET IPADDR=%s' + WINEOL +
    'SET NETMASK=%s' + WINEOL +
    'SET GATEWAY=%s' + WINEOL +
    'SET DNSPRI=%s' + WINEOL +
    'SET DNSSEC=%s' + WINEOL;


var UBUNTU_TEPMLATE =
    '# The primary network interface' + EOL +
    'auto eth%s' + EOL +
    'iface eth%s inet static' + EOL +
    'address %s' + EOL +
    'netmask %s' + EOL;

var UBUNTU_GATEWAY_TEMPLATE = 'gateway %s' + EOL;
var UBUNTU_DNS_TEMPLATE = 'dns-nameservers %s %s' + EOL;

var GW_IPTABLES_TEMPLATE =
    'iptables -A PREROUTING -t nat -i eth1 -p tcp --dport %s -j DNAT --to %s:%s ' + EOL +
    'iptables -A FORWARD -p tcp -d %s --dport %s -j ACCEPT' + EOL;


var numberImages = 0;
var imageCounter = 0;
var imagesData = {};

function getDataFromDB() {

    var dbpath = path.join(json['base_path'], DB_NAME);
    console.log('using db: ' + dbpath);
    var db = new sqlite3.Database(dbpath);


    // eval number of hosts and gateways (for each of them a db query must be performed)
    if (json.hasOwnProperty('segment')) {
        json['segment'].forEach(function (segment) {
            if (segment.hasOwnProperty('host')) {
                segment['host'].forEach(function () {
                    numberImages++;
                });
            }
            if (segment.hasOwnProperty('gateway')) {
                segment['gateway'].forEach(function () {
                    numberImages++;
                });
            }
        });
    }

    console.log('db queries to be performed: ' + numberImages);

    if (json.hasOwnProperty('segment')) {
        json['segment'].forEach(function (segment) {
            if (segment.hasOwnProperty('host')) {
                segment['host'].forEach(function (host) {

                    queryDB(db, host['label'], host['os'], host['major patch']);

                });
            }

            if (segment.hasOwnProperty('gateway')) {
                segment['gateway'].forEach(function (gateway) {

                    queryDB(db, gateway['label'], gateway['os'], gateway['major patch']);

                });
            }

        });
    }
}


//
//
//
function queryDB(db, label, os, major_patch) {

    if (major_patch === 'none') {
        var mp = "os.major_patch IS NULL";
    } else {
        var mp = "os.major_patch = \'" + major_patch + "\'";
    }
    var query = util.format('select os.image_name, os.root_partition_id, os.vg_lv from os inner join architecture on architecture.id ' +
    '== os.fk_architecture_id where os.name = \'%s\' and ' + mp + ';', os);


    db.all(query, function (err, rows) {

        if (err) {
            console.error('db query failed: ' + err);
            db.close();
            process.exit(1);
        }

        if (rows[0] == undefined) {
            console.error('cannot get images info for host/gateway' + label);
            db.close();
            process.exit(1);
        }


        //console.log('db query returned image_name: ' + rows[0]['image_name'] + ', ' + rows[0]['root_partition_id'] + ', ' + rows[0]['vg_lv']);
        imagesData[label] = rows[0];

        if (++imageCounter == numberImages) {

            console.log('all DB queries done');
            db.close();
            // all queries done: continue with setup
            finalizeSetup(imagesData);
        }
    });
}

var json;
function setup(jsonData) {
    json = jsonData;
    // need to increase the number of file descriptors due to shelljs
    if (exec("ulimit -n 20000") != 0) {
        return false;
    }

    getDataFromDB();

    return true;
}

function finalizeSetup(imagesData) {

    if (configure(imagesData)) {
        console.log('SETUP succeeded');
    } else {
        process.exit(1);
    }
}

function configure(imagesData) {

    var status = true;

    // create bridges on all pnodes of all segments
    // tell opennebula about onevnet of all segments

    if (json.hasOwnProperty('segment')) {
        json['segment'].every(function (segment) {
            if (segment.hasOwnProperty('pnode')) {
                segment['pnode'].every(function (pnode) {

                    // create bridge
                    var cmd = util.format('ssh root@%s ovs-vsctl add-br \'%s\'', pnode, segment['ovswitch']);
                    if (exec(cmd) != 0) {
                        status = false;
                    }
                    return status;
                });
            }

            if (!status) {
                return false;
            }

            // tell about onevnet
            var onevnetName = path.join(json['output_path'], segment['label'] + stage.ONEVNET_EXT);
            var cmd = util.format('su -c \"onevnet create \'%s\'\" oneadmin', onevnetName);
            if (exec(cmd) != 0) {
                status = false;
            }

            if (!status) {
                return false;
            }

            var net = segment['net'];
            var spl = net.split('.');
            var ipRandStub = spl[0] + '.' + spl[1] + '.' + spl[2] + '.';
            var ipCnt = 253;
            // create GRE tunnels for all pnodes of segment
            if (segment.hasOwnProperty('pnode')) {
                segment['pnode'].every(function (pnode1) {

                    //ssh pnode1 ip addr add ${rand.ip}/${mask} dev $segment.ovswitch
                    if (segment['pnode'].length > 1) {
                        var randIp = ipRandStub + ipCnt;
                        ipCnt--;
                        var netmask = getNetmaskFromCidr(segment['net'], false);
                        var cmd = util.format('ssh root@%s ip addr add %s/%s dev %s', pnode1, randIp, netmask, segment['ovswitch']);
                        if (exec(cmd) != 0) {
                            status = false;
                            return false;
                        }
                    }
                    segment['pnode'].every(function (pnode2) {

                        // no GRE tunnel to itself of course
                        if (pnode1 != pnode2) {

                            // get peer ip
                            var cmd = util.format('ssh root@%s  ip -4 -o addr | grep mpgre |awk \'!/^[0-9]*: ?lo|link\\/ether/ {gsub(\"/\", \" \"); print $4}\'', pnode2);
                            var ret = execRet(cmd, {silent: false});

                            if (ret.code != 0) {
                                status = false;
                                return status;
                            }
                            var dst = ret.output;
                            var idx = dst.indexOf('\n');
                            if (idx != -1) {
                                dst = dst.substring(0, idx);
                            }

                            // setup conn
                            var cmd = util.format('ssh root@%s ovs-vsctl add-port %s %s-gre -- set interface %s-gre type=gre options:remote_ip=%s',
                                pnode1, segment['ovswitch'], pnode2, pnode2, dst);
                            if (exec(cmd) != 0) {
                                status = false;
                                return status;
                            }
                        }
                        return status;
                    });

                    return status;
                });
            }

            return status;
        });
    }

    if (!status) {
        return false;
    }

    //
    //  load images into open nebula
    //  mount images
    if (json.hasOwnProperty('segment')) {
        json['segment'].every(function (segment) {

            // handle hosts
            if (segment.hasOwnProperty('host')) {
                segment['host'].every(function (host) {

                    // load image into open nebula

                    var imagepath = path.join(json['base_path'], json['image_path'], imagesData[host['label']]['image_name']);
                    var cmd = util.format('su -c \"oneimage create -d 1  --persistent --name \'%s\' --path %s --prefix sd --type os --driver qcow2\" oneadmin', host['label'], imagepath);
                    if (exec(cmd) != 0) {
                        status = false;
                    }

                    if (!mountAndReplace(host, true, imagesData[host['label']])) {
                        status = false;
                    }
                    return status;
                });
            }

            if (!status) {
                return false;
            }

            // handle gateways
            if (segment.hasOwnProperty('gateway')) {
                segment['gateway'].every(function (gateway) {
                    // load image into open nebula

                    var imagepath = path.join(json['base_path'], json['image_path'], imagesData[gateway['label']]['image_name']);
                    var cmd = util.format('su -c \"oneimage create -d 1  --persistent --name \'%s\' --path %s --prefix sd --type os --driver qcow2\" oneadmin', gateway['label'], imagepath);
                    if (exec(cmd) != 0) {
                        status = false;
                    }

                    if (!mountAndReplace(gateway, false, imagesData[gateway['label']])) {
                        status = false;
                    }
                    return status;
                });
            }


            return status;
        });
    }


    if (!status) {
        return false;
    }

    //  add vms to open nebula
    //  start vms on pnode

    if (json.hasOwnProperty('segment')) {
        json['segment'].every(function (segment) {

            // handle hosts
            if (segment.hasOwnProperty('host')) {
                segment['host'].every(function (host) {

                    // 5. add vm to open nebula

                    var fileName = host['label'] + stage.ONEVM_EXT;
                    var cmd = util.format('su -c \"onevm create \'%s/%s\' --hold\" oneadmin', json['output_path'], fileName);
                    if (exec(cmd) != 0) {
                        status = false;
                        return status;
                    }

                    // start vm on pnode

                    var pnode = host['pnode'];
                    if (validator.isNullOrEmpty(pnode)) {
                        pnode = segment['pnode'][0];
                    }
                    var cmd = util.format('su -c \"onevm deploy \'%s\' \'%s\'\" oneadmin', host['label'], pnode);
                    if (exec(cmd) != 0) {
                        status = false;
                    }

                    return status;
                });
            }

            if (!status) {
                return status;
            }

            // handle gateways

            if (segment.hasOwnProperty('gateway')) {
                segment['gateway'].every(function (gateway) {

                    // 5. add vm to open nebula

                    var fileName = gateway['label'] + stage.ONEVM_EXT;
                    var cmd = util.format('su -c \"onevm create \'%s/%s\' --hold\" oneadmin', json['output_path'], fileName);
                    if (exec(cmd) != 0) {
                        status = false;
                        return status;
                    }

                    // start vm on pnode

                    var pnode = gateway['pnode'];
                    if (validator.isNullOrEmpty(pnode)) {
                        pnode = segment['pnode'][0];
                    }
                    var cmd = util.format('su -c \"onevm deploy \'%s\' \'%s\'\" oneadmin', gateway['label'], pnode);
                    if (exec(cmd) != 0) {
                        status = false;
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
//
//
//
function mountAndReplace(vnode, isHost, imageData) {


    var cmd = util.format('su -c \"oneimage show \'%s\'\" oneadmin |grep SOURCE |awk \'{print $3}\'', vnode['label']);
    console.log('shelljs: ' + cmd);

    do {
        sh.exec('sleep 30');

        var ret = execRet(cmd, {silent: false});

        if (ret.code != 0) {
            return false;
        }

    } while (ret.output.indexOf("/") == -1);

    console.log('shelljs output: <' + ret.output + '>');
    var imageName = ret.output;

    // we MUST remove a tailing \n from the imageName. Otherwise the command blocks (WTF?!)
    var idx = imageName.indexOf('\n');
    if (idx != -1) {
        imageName = imageName.substring(0, idx);
    }


    if (exec('lsmod | grep nbd') == 1) {
        if (exec('modprobe nbd max_part=63') != 0) {
            return false;
        }
    }
    var cmd = 'qemu-nbd -c /dev/nbd0 ' + imageName;
    if (exec(cmd) != 0) {
        return false;
    }


    if (exec('file /mnt/setup') == 1) {
        if (exec('mkdir /mnt/setup') != 0) {
            return false;
        }
    }

    if (exec('mount | grep /mnt/setup') != 1) {
        if (exec('umount /mnt/setup') != 0) {
            return false;
        }
    }


    var vg_lv = imageData['vg_lv'];
    if (vg_lv) {
        var vg = vg_lv;
        var idx = vg_lv.indexOf('/');
        if (idx != -1) {
            vg = vg_lv.substring(0, idx);
        }
        var cmd = util.format('vgchange -a y %s; mount /dev/%s /mnt/setup', vg, vg_lv);
        if (exec(cmd) != 0) {
            return false;
        }

    } else {
        var cmd = util.format('mount /dev/nbd0p%s /mnt/setup', imageData['root_partition_id']);
        if (exec(cmd) != 0) {
            return false;
        }

    }
    var os = vnode['os'].toLowerCase();

    var isWindows = os.indexOf('windows') != -1;

    if (isHost) {
        if (!writeInterfaceFiles4Host(vnode, isWindows)) {
            return false;
        }
    } else {
        if (!writeInterfaceAndRulesFiles4Gateway(vnode, isWindows)) {
            return false;
        }
    }

    if (exec('umount /mnt/setup') != 0) {
        return false;
    }

    if (vg_lv) {
        var cmd = util.format('vgchange -a n %s', vg);
        if (exec(cmd) != 0) {
            return false;
        }
    }

    if (exec('qemu-nbd -d /dev/nbd0') != 0) {
        return false;
    }

    return true;
    /*

     wenn 'lsmod |grep nbd' == status 1 , modprobe nbd max_part=63
     qemu-nbd -c /dev/nbd0 ${image.qcow2}

     wenn 'file /mnt/setup' == status 1, mkdir /mnt/setup

     wenn 'mount |grep /mnt/setup' != 0, dann umount /mnt/setup

     wenn ${sqlite os.lvm != NULL}, vgchange -a y ${os.lvm <-- vg-teil}; mount /dev/${os.lvm}
     oder mount /dev/nbd0p${sqlite os.root_partition_id} /mnt/setup

     wenn ${os.name} windows*, --> /mnt/setup/config/wrapper.cmd bearbeiten:

     SET LANCON=__LANCON__
     SET SRVROLE=__SRVROLE__
     SET IPADDR=__IPADDR__
     SET NETMASK=__NETMASK__
     SET GATEWAY=__GATEWAY__
     SET DNSPRI=__DNSPRI__
     SET DNSSEC=__DNSSEC__

     erklärung (stichwortartig)
     LANCON = interface name: 'LAN-Verbindung' (das 1. ohne Nummer, dann 2,3,4
     SRVROLE = dc|fs|exch|clnt
     IPADDR = ip address
     NETMASK = nm
     GATEWAY = gw
     DNSPRI = dns
     DNSSEC = not used
     EXTDOM = public reachable domain​


     wenn ${os.name} ubuntu*, --> /mnt/setup/etc/network/interfaces.template bearbeiten, dann cp /mnt/setup/etc/network/interfaces.template /mnt/setup/etc/network/interfaces

     address __IPADDR__
     netmask __NETMASK__
     gateway __GATEWAY__
     dns-nameservers __DNSPRI__

     umount /mnt/setup
     qemu-nbd -d /dev/nbd0
     */
}

//
//
//
//
function writeInterfaceFiles4Host(host, isWindows) {

    var status = true;

    if (host.hasOwnProperty('ip')) {
        var iface = 0;
        host['ip'].every(function (ip) {
            var segment = getSegment(ip);
            if (segment) {
                if (host['gw']) {
                    var gwStr = '';
                    // the gateway address is also in the range of the segment's cidr
                    if (validator.isIpInRange(host['gw'], segment['net'])) {
                        if (isWindows) {
                            gwStr = host['gw'];
                        } else {
                            gwStr = util.format(UBUNTU_GATEWAY_TEMPLATE, host['gw']);
                        }
                    }
                }
                var netmask = getNetmaskFromCidr(segment['net'], isWindows);
                if (!netmask) {
                    netmask = '';
                }

                var nsStr1 = '';
                var nsStr2 = '';
                if (iface == 0 && host.hasOwnProperty('ns') && host['ns'].length > 0) {
                    // if the host has ns entries we add them to the 1st iface file we generate

                    if (isWindows) {
                        nsStr1 = host['ns'][0];
                        nsStr2 = (host['ns'][1] ? host['ns'][1] : '');
                    } else {
                        nsStr1 = util.format(UBUNTU_DNS_TEMPLATE, host['ns'][0], (host['ns'][1] ? host['ns'][1] : ''));
                    }
                }
                var ifaceStr;
                if (isWindows) {
                    var lanCon = 'LAN-Verbindung' + ((iface == 0) ? '' : (' ' + (iface + 1)));
                    ifaceStr = util.format(WINDOWS_TEMPLATE, lanCon, getSrvRole(host['os']), ip, netmask, gwStr, nsStr1, nsStr2);

                } else {
                    ifaceStr = util.format(UBUNTU_TEPMLATE, iface, iface, ip, netmask) + gwStr + nsStr1;
                }

                console.log('*********************** ' + host['label'] + ' / ' + ip + '\n' + ifaceStr + '***********************************************************');
                var fileName;
                var pa;
                if (isWindows) {
                    pa = '/mnt/setup/config/netconns';
                    fileName = path.join(pa, 'nc' + iface + '.cmd');
                } else {
                    pa = '/mnt/setup/etc/network/interfaces.d';
                    fileName = path.join(pa, 'eth' + iface + '.cfg');
                }
                var fd;
                try {

                    mkdirp.sync(pa);
                    fd = fs.openSync(fileName, FILEFLAG);
                    fs.writeSync(fd, ifaceStr);

                } catch (e) {

                    console.error('failed to write file ' + fileName + ' :' + e);
                    status = false;
                } finally {
                    if (fd) {
                        fs.closeSync(fd);
                    }
                }
            } else {
                console.log('cannot find net for ip ' + ip);
                status = false;
            }

            iface++;

            return status;
        });
    }
    return status;
}

//
//
//
//
function writeInterfaceAndRulesFiles4Gateway(gateway, isWindows) {

    var status = true;

    // write iptables.rules file
    if (gateway.hasOwnProperty('iptables')) {

        var rulesStr = '';
        gateway['iptables'].forEach(function (iptable) {

            rulesStr = rulesStr + util.format(GW_IPTABLES_TEMPLATE, iptable['inport'], iptable['dst'], iptable['outport'], iptable['dst'], iptable['outport']);
        });
        rulesStr = rulesStr + 'exit 0' + EOL;
        console.log('*********************** ' + gateway['label'] + ' / iptables.rules:\n ' + rulesStr + '***********************************************************');

        var pa = '/mnt/setup/etc';
        var fileName = path.join(pa, 'rc.local');
        var fd;
        try {

            mkdirp.sync(pa);
            fd = fs.openSync(fileName, FILEFLAG);
            fs.writeSync(fd, rulesStr);

        } catch (e) {

            console.error('failed to write file ' + fileName + ' :' + e);
            status = false;
        } finally {
            if (fd) {
                fs.closeSync(fd);
            }
        }
    }

    if (!status) {
        return false;
    }


    var iface = 0;


    // handle ipin
    if (!writeInterfaceFile4Gateway(gateway, gateway['ipin'], iface, isWindows)) {
        return status;
    }

    iface++;

    // handle ipout
    if (!writeInterfaceFile4Gateway(gateway, gateway['ipout'], iface, isWindows)) {
        return status;
    }

    return status;
}

//
//
//
//
function writeInterfaceFile4Gateway(gateway, ip, iface, isWindows) {

    var status = true;

    var segment = getSegment(ip);
    if (segment) {
        var netmask = getNetmaskFromCidr(segment['net'], isWindows);
        if (!netmask) {
            netmask = '';
        }

        var nsStr1 = '';
        var nsStr2 = '';
        var ruleStr = '';
        if (iface == 0) {
            if (gateway.hasOwnProperty('ns') && gateway['ns'].length > 0) {
                // if the host has ns entries we add them to the 1st iface file we generate

                if (isWindows) {
                    nsStr1 = host['ns'][0];
                    nsStr2 = (host['ns'][1] ? host['ns'][1] : '');
                } else {
                    nsStr1 = util.format(UBUNTU_DNS_TEMPLATE, gateway['ns'][0], (gateway['ns'][1] ? gateway['ns'][1] : ''));
                }
            }

            //ruleStr = 'pre-up iptables-restore < /etc/iptables.rules' + EOL;
            ruleStr = '' + EOL;

        }

        var ifaceStr;
        if (isWindows) {
            var lanCon = 'LAN-Verbindung' + ((iface == 0) ? '' : (' ' + (iface + 1)));
            ifaceStr = util.format(WINDOWS_TEMPLATE, lanCon, getSrvRole(gateway['os']), ip, netmask, '', nsStr1, nsStr2);

        } else {
            ifaceStr = util.format(UBUNTU_TEPMLATE, iface, iface, ip, netmask) + nsStr1 + ruleStr;
        }

        console.log('*********************** ' + gateway['label'] + ' / ' + ip + '\n' + ifaceStr + '***********************************************************');
        var fileName;
        var pa;
        if (isWindows) {
            pa = '/mnt/setup/config/netconns';
            fileName = path.join(pa, 'nc' + iface + '.cmd');
        } else {
            pa = '/mnt/setup/etc/network/interfaces.d';
            fileName = path.join(pa, 'eth' + iface + '.cfg');
        }
        var fd;
        try {

            mkdirp.sync(pa);
            fd = fs.openSync(fileName, FILEFLAG);
            fs.writeSync(fd, ifaceStr);

        } catch (e) {

            console.error('failed to write file ' + fileName + ' :' + e);
            status = false;
        } finally {
            if (fd) {
                fs.closeSync(fd);
            }
        }
    } else {
        console.log('cannot find net for ip ' + ip);
        status = false;
    }

    return status;
}

//
// Returns the srvRole string for the os string.
//
function getSrvRole(os) {
    if (os.indexOf('_active_directory') != -1) {
        return 'dc';
    }
    if (os.indexOf('_fs') != -1) {
        return 'fs';
    }
    if (os.indexOf('_exchange') != -1) {
        return 'exch';
    }
    if (os.indexOf('windows7') != -1) {
        return 'clnt';
    }

    return '';
}

//
// Returns the netmask of the segment's 'net' the ip address 'ip' matches.
//
function getSegment(ip) {

    //todo use every to break if found
    var segment;
    if (json.hasOwnProperty('segment')) {
        json['segment'].forEach(function (seg) {
            if (validator.isIpInRange(ip, seg['net'])) {
                var idx = seg['net'].indexOf('/');
                if (idx != -1) {
                    segment = seg;
                }
            }
        });
    }

    return segment;
}

//
// Returns netmask of cidr (netmask e.g. 255.240.0.0 for windows, bitmask e.g. 24 for linux)
//
//
function getNetmaskFromCidr(cidr, isWindows) {

    var netmask;
    if (isWindows) {
        var block = new nmask(cidr);
        return block.mask;
    } else {
        var idx = cidr.indexOf('/');
        if (idx != -1) {
            netmask = cidr.substring(idx + 1);
        }
    }
    return netmask;
}

//
//
//
//
function stripCommand(cmd) {
    return cmd.replace('\n', ' ');
}

//
// Executes a cmd with shelljs
//
// Return: exit status of command
function exec(cmd) {

    return execRet(cmd).code;
}

//
// Executes a cmd with shelljs
//
// Return: return object
function execRet(cmd) {

    console.log('shelljs: ' + cmd);

    var ret = sh.exec(cmd, {silent: false});

    if (ret.code != 0) {
        console.log('\"' + cmd + '\" failed: code ' + ret.code + ': ' + ret.output);
    }

    return ret;
}
/*
 function readFile(fileName) {
 var content;
 try {
 content = fs.readFileSync(fileName, {'encoding': 'utf8'});
 } catch (e) {
 console.error('cannot read ' + fileName + ': ' + e);
 return undefined;
 }

 return content;
 }
 */

exports.setup = setup;
exports.exec = exec;

