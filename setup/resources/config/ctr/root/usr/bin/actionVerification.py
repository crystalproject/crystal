#!/usr/bin/env python
"""actionVerification.py: 
Small script to check if a given host is reachable and/or pre defined services are available.
Services can be defined in the config.py file.

Current return codes:
'OK':           0
'ERROR':        1
'TARGET_ERROR': 50
'NOTSURE':      100

Author: Tomer Siani Nov. 2014

"""

import sys
import time
import nmap
import argparse
import socket

#Import configurations
from config import services as service_ref
from config import return_codes as return_codes

#define parser for arguments
parser = argparse.ArgumentParser(description='Checks activity for given host using nmap. (Currently only supporting IPv4)')
parser.add_argument('-t', default="10.20.4.115", type=str, dest='target', help='target IP/hostname')
parser.add_argument('-p', default='0', type=int, dest='port', help='Port to scan on target')
parser.add_argument('-s', default="", type=str, dest='service', help='Service to scan for on target')
parser.add_argument('-S', action='store_true', help='Scans all target services')
parser.add_argument('-A', action='store_true', help='Agressive scanning')
parser.add_argument('-v', action='store_true', help='verbose output')
parser.add_argument('--debug', action='store_true', help='Debug output')

global v,d
d=False
v=False

try:
    nm = nmap.PortScanner()         # instantiate nmap.PortScanner object
except nmap.PortScannerError:
    print('Nmap not found', sys.exc_info()[0])
    sys.exit(1)
except:
    print("Unexpected error:", sys.exc_info()[0])
    sys.exit(1)

def main(argv=sys.argv):    
    
    args=parser.parse_args()
    global v,d
    v = args.v
    d = args.debug
    target=checkTarget(args.target)
    port = args.port
    service = args.service
    scanArgs=""
    if args.A:
        log("Agressive scan active")
        scanArgs="-A"
    return_value=0

    #If service scan is required print output
    if args.S:
        v = True
        for i in service_ref:
            checkService(target,service_ref[i],scanArgs)
    else:
        
        #If only the target is defined ping scan
        if port==0 and service=="":
            log("Checking if host is up")
            nm.scan(target,arguments='-sn') 
            return_value=isUp(nm[target].state())
        
        #if port is defined
        if port>0 and service=="":
            return_value=checkPort(target,port,scanArgs)           
            
        #Check if service is regitered in config file
        if service in service_ref:
            log("Checking service {} on port {}".format(service,service_ref[service]))
            return_value   = checkService(target,service_ref[service],scanArgs)
            
        elif service != "":
            log("Service not registered in config-file")
            return_value   = return_codes['ERROR']
    print("Return value = {}".format(return_value))
    sys.exit(int(return_value))
    
def log(string):
    if v:
        print(string)
        
def debugLog(string):
    if d:
        print("---DEBUG: {}".format(string))
        
def isUp(state):
    if state=="up":
        return return_codes['OK']
    else:
        return return_codes['ERROR']

def checkPort(target,port,scanArgs):
    nm.scan(target,arguments='{} -p {}'.format(scanArgs,port))
    debugLog("Issued nmap command: {}".format(nm.command_line()))
    if nm[target].has_tcp(port):
            #nm[target].tcp(int(port))
            state=nm[target]['tcp'][port]['state']
            log('port : %s\tstate : %s' % (port, state))
            debugLog("State    : {}".format(state))
            debugLog("Scan info: {}".format(nm.scaninfo()))
            debugLog("Protocols: {}".format(nm[target].all_protocols())) 
            debugLog(nm.csv())
            if isOpen(nm[target]['tcp'][port]['state']):
                return return_codes['OK']
            else:
                return return_codes['ERROR']
    else:
        return None
        
def checkService(target,port,scanArgs):
    nm.scan(target,arguments='-sV {} -p {}'.format(scanArgs,port)) 
    debugLog("Issued nmap command: {}".format(nm.command_line()))
    if nm[target].has_tcp(port):
            state=nm[target]['tcp'][port]['state']
            service=nm[target]['tcp'][port]['product']
            version=nm[target]['tcp'][port]['version']
            debugLog("State    : {}".format(state))
            debugLog("Service  : {}".format(service))
            debugLog("Version  : {}".format(version))
            debugLog("Scan info: {}".format(nm.scaninfo()))
            debugLog("Protocols: {}".format(nm[target].all_protocols())) 
            debugLog(nm.csv())
            log('port : %s\tstate : %s' % (port, nm[target]['tcp'][port]['state']))
           
            #Version detected: service most likely running
            if isOpen(state) and  not version=="":
                log("Service running: {}".format(service))
                log("Version info: {}\n".format(version))
                return return_codes['OK']
                
            #Version could not be detected
            if isOpen(state) and version=="":
                log("Failed to determine Verion. Port open but service not reachable")
                return return_codes['NOTSURE']
            else:
                return return_codes['ERROR']               
    else:
        return return_codes['ERROR']
        
def isOpen(state): 
    if state=="open":
        return 1
    else:
        return 0

#Check if target (hostname/ip)         
def checkTarget(target):
    try:
        socket.inet_aton(target)
        return target    
    except:
        try:
            log("Target given is not a valit IPv4 ip")
            log("Found host ip:{}".format(socket.gethostbyname_ex(target)))
            return str(socket.gethostbyname(target))
        except:
            print("Could not resolve hostname")
            sys.exit(return_codes['TARGET_ERROR'])
            
        
__name__="__main__"    
main()
