#!/bin/bash

# start 2 ovs switches
ovs-vsctl add-br ssh1-sw1

# create span interfaces for each of them
modprobe dummy

# make sure these are up
ip link set up dummy0

# put them into the switches
ovs-vsctl add-port ssh1-sw1 dummy0

# define them as span port in the switch
ovs-vsctl -- --id=@p get port dummy0 -- --id=@m create mirror name=mirror1 -- add bridge ssh1-sw1 mirrors @m -- set mirror mirror1 output_port=@p

ovs-vsctl set mirror mirror1 select_all=1

# add switch interconnection taps
ip tuntap add dev ns3-contap1 mode tap

ip link set ns3-contap1 up

ovs-vsctl add-port ssh1-sw1 ns3-contap1

ovs-vsctl add-port ssh1-sw1 rgre -- set interface rgre type=gre options:remote_ip=172.16.0.1

ip addr add 10.1.1.30 peer 10.1.1.20 dev ssh1-sw1
