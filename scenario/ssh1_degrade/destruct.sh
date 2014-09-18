#!/bin/bash
ovs-vsctl del-port ssh1-sw1 ns3-contap1
ovs-vsctl del-port ssh1-sw1 dummy0
ovs-vsctl del-br ssh1-sw1

rmmod dummy

ovs-vsctl clear Bridge ssh1-sw1 mirrors
ip link del ns3-contap1
