#!/bin/bash

# copy the interconnector to the simulator environment
cp ns3/l2-ovs-interconnector.cc /opt/ns3/ns-allinone-3.20/ns-3.20/scratch/

# setup env
#source /opt/ns3/ns-allinone-3.20/

# start 2 ovs switches
ovs-vsctl add-br ssh1-sw0

# create span interfaces for each of them
modprobe dummy

# make sure these are up
ip link set up dummy0

# put them into the switches
ovs-vsctl add-port ssh1-sw0 dummy0

# define them as span port in the switch
ovs-vsctl -- --id=@p get port dummy0 -- --id=@m create mirror name=mirror0 -- add bridge ssh1-sw0 mirrors @m -- set mirror mirror0 output_port=@p

ovs-vsctl set mirror mirror0 select_all=1

# add switch interconnection taps
ip tuntap add dev ns3-contap0 mode tap
ip tuntap add dev helpertap mode tap

ip link set ns3-contap0 up
ip link set helpertap up

ovs-vsctl add-port ssh1-sw0 ns3-contap0

brctl addbr grebr
ip link add gretap type gretap remote 172.16.0.2 local 172.16.0.1
brctl addif grebr gretap
ip link set gretap up
ip link set grebr up
ip addr add 10.1.1.20/24 dev grebr

vnets=$(su -c "onevnet create ssh1-switch0.net" oneadmin | cut -d ' ' -f 2)
vnets=$(echo "$vnets $(su -c "onevnet create ssh1-switch1.net" oneadmin | cut -d ' ' -f 2)")

export vnets
