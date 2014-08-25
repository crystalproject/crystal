#!/bin/bash

# copy the interconnector to the simulator environment
cp ns3/l2-ovs-interconnector.cc /opt/ns3/ns-allinone-3.20/ns-3.20/scratch/

# setup env
#source /opt/ns3/ns-allinone-3.20/

# start 2 ovs switches
ovs-vsctl add-br ssh1-sw0
ovs-vsctl add-br ssh1-sw1

# create span interfaces for each of them
modprobe dummy numdummies=2

# make sure these are up
ip link set up dummy0
ip link set up dummy1

# put them into the switches
ovs-vsctl add-port ssh1-sw0 dummy0
ovs-vsctl add-port ssh1-sw1 dummy1

# define them as span port in the switch
ovs-vsctl -- --id=@p get port dummy0 -- --id=@m create mirror name=mirror0 -- add bridge ssh1-sw0 mirrors @m -- set mirror mirror0 output_port=@p
ovs-vsctl -- --id=@p get port dummy1 -- --id=@m create mirror name=mirror1 -- add bridge ssh1-sw1 mirrors @m -- set mirror mirror1 output_port=@p

ovs-vsctl set mirror mirror0 select_all=1
ovs-vsctl set mirror mirror1 select_all=1

# add switch interconnection taps
ip tuntap add dev ns3-contap0 mode tap
ip tuntap add dev ns3-contap1 mode tap

ip link set ns3-contap0 up
ip link set ns3-contap1 up

ovs-vsctl add-port ssh1-sw0 ns3-contap0
ovs-vsctl add-port ssh1-sw1 ns3-contap1

echo "before you start the scenario, please attach the server and attacker vm to ssh1-sw0 and victim to ssh1-sw1 via the sunstone interface, start them and assign ip addresses to get ready"
echo "In addition, please set an ip address on at least one of the two mentioned switches in the same range as the vms in order to interact with the scenario (eg. start an inject)"
