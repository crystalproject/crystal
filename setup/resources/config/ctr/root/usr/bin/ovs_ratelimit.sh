#!/bin/bash

enable_ratelimit() {
	local switch="${1}"
	local speed="${2}"
	for port in $(ovs-vsctl list-ports "${switch}"); do
		ovs-vsctl set Interface "${port}" ingress_policing_rate="${speed}"
		ovs-vsctl set Interface "${port}" ingress_policing_burst="$(expr "${speed}" / 10)"
	done
	return "${?}"
}

disable_ratelimit() {
	local switch="${1}"
	local speed="${2}"
	for port in $(ovs-vsctl list-ports "${switch}"); do
		ovs-vsctl clear Interface "${port}" ingress_policing_rate
		ovs-vsctl clear Interface "${port}" ingress_policing_burst
	done
	return "${?}"
}

case ${1} in
  enable)
    shift

    enable_ratelimit "${@}"

    exit "${?}"
    ;;

  disable)
    shift

    disable_ratelimit "${@}"

    exit "${?}"
    ;;

  *)
    echo "bad usage" >&2
    exit 1
    ;;
esac
