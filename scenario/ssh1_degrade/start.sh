#!/bin/bash

echo "hit ctrl-c to stop the simulator"

tcpdump -i dummy0 -w ssh1-sw0.pcap &
tcpdump -i dummy1 -w ssh1-sw1.pcap &

WD=$(pwd)
cd /opt/ns3/ns-allinone-3.20/ns-3.20/
./waf --run scratch/l2-ovs-interconnector ; cd $WD

killall -9 tcpdump

echo "you can re-establish by restarting this script"
