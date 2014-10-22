#!/bin/bash
BINDIR="/usr/local/sbin"

tail -n 0 -f /var/log/imap_connections.log | while read line
do

  case "${line}" in

  *Login:*)
    email=$(echo "${line}" | sed -e 's/.*user=<\(.*\)>,.*/\1/')
    name=$(${BINDIR}/mgmt_dashboard.sh getbyemail ${email})
    ${BINDIR}/mgmt_dashboard.sh add ${name}
    echo "User ${email} logged in"
  ;;
  *"Logged out"* | *"Connection closed"*)
    #user=$(echo "${line}" | sed 's/.*imap\(.*\).*/\1/g')
    email=$(echo "${line}" | sed -e 's/.*imap(\(.*\)):\ .*/\1/')
    name=$(${BINDIR}/mgmt_dashboard.sh getbyemail ${email})
    ${BINDIR}/mgmt_dashboard.sh del ${name}
    echo "User ${email} logged out"

  ;;

  *)
    echo "dropped"
  ;;
  esac

done
