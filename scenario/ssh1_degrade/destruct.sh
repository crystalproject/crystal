#!/bin/bash
"please shut down the vms.. destructing the attached switches now"
ovs-vsctl del-port ssh1-sw0 ns3-contap0
ovs-vsctl del-port ssh1-sw0 dummy0
ovs-vsctl del-br ssh1-sw0

ovs-vsctl del-port ssh1-sw1 ns3-contap1
ovs-vsctl del-port ssh1-sw dummy1
ovs-vsctl del-br ssh1-sw1

rmmod dummy

ovs-vsctl clear Bridge ssh1-sw0 mirrors
ovs-vsctl clear Bridge ssh1-sw1 mirrors
