#!/bin/bash

# CONST
SUFFIX="$(grep "^olcSuffix:" '/etc/ldap/slapd.d/cn=config/olcDatabase={1}hdb.ldif' | cut -d':' -f 2)"
LOGIN="cn=admin, ${SUFFIX}"
PASS="asdfasdf"

# BIN
LD_SEARCH="$(which ldapsearch)"
LD_MODIFY="$(which ldapmodify)"

# RES DIR
RESDIR="/usr/local/share/dashboard"

# ARGV
ID="${2}"
NAME="${3}"

# decode base64
#un64='awk '\''BEGIN{FS=":: ";c="base64 -d"}{if(/\w+:: /) {print $2 |& c; close(c,"to"); c |& getline $2; close(c); printf("%s:: \"%s\"\n", $1, $2); next} print $0 }'\'''

add_entry () {
  local num_entries=$("${LD_SEARCH}" -D "${LOGIN}" -w "${PASS}" -LLL -b "cn=dashboard,ou=groups,${SUFFIX}" |grep -c "^member: ")
  local timestamp file
  timestamp=$(date +%s%N)

  if [[ "${num_entries}" -eq 1 ]]; then

    ${LD_SEARCH} -D "${LOGIN}" -w "${PASS}" -LLL -b "cn=dashboard,ou=groups,${SUFFIX}" |grep "^member: cn=dummy" &>/dev/null

    if [[ ${?} -eq 0 ]]; then

      # change 1st entry
      sed "s/__SUFFIX__/${SUFFIX}/g;s/__ID__/${ID}/g;s/__NAME__/${NAME}/g" "${RESDIR}/actions/modify.ldif" > "/tmp/${timestamp}_modify.ldif"
      file="/tmp/${timestamp}_modify.ldif"

    else

      # add entry
      sed "s/__SUFFIX__/${SUFFIX}/g;s/__ID__/${ID}/g;s/__NAME__/${NAME}/g" "${RESDIR}/actions/add.ldif" > "/tmp/${timestamp}_add.ldif"
      file="/tmp/${timestamp}_add.ldif"

    fi

  else
    # add entry

    sed "s/__SUFFIX__/${SUFFIX}/g;s/__ID__/${ID}/g;s/__NAME__/${NAME}/g" "${RESDIR}/actions/add.ldif" > "/tmp/${timestamp}_add.ldif"
    file="/tmp/${timestamp}_add.ldif"

  fi

  if [[ -n "${file}" ]]; then
    "${LD_MODIFY}" -D "${LOGIN}" -w "${PASS}" -f "${file}"

    local ret="${?}"

    if [[ "${ret}" -eq 0 ]]; then
      echo "operation done"
      return 0
    else
      echo "operation failed. exit status was ${ret}"
      return "${ret}"
    fi
  else
    echo "requested operation could not be executed" >&2
    return 1
  fi

}

delete_entry () {
  local num_entries=$("${LD_SEARCH}" -D "${LOGIN}" -w "${PASS}" -LLL -b "cn=dashboard,ou=groups,${SUFFIX}" |grep -c "^member:")
  local timestamp file
  timestamp=$(date +%s%N)

  if [[ "${num_entries}" -eq 1 ]]; then
    # replace
    sed "s/__SUFFIX__/${SUFFIX}/g;s/__ID__/dummy/g;s/__NAME__//g" "${RESDIR}/actions/modify.ldif" > "/tmp/${timestamp}_modify.ldif"
    file="/tmp/${timestamp}_modify.ldif"
  else
    # delete
    sed "s/__SUFFIX__/${SUFFIX}/g;s/__ID__/${ID}/g;s/__NAME__/${NAME}/g" "${RESDIR}/actions/delete.ldif" > "/tmp/${timestamp}_delete.ldif"
    file="/tmp/${timestamp}_delete.ldif"
  fi

  if [[ -n "${file}" ]]; then
    "${LD_MODIFY}" -D "${LOGIN}" -w "${PASS}" -f "${file}"

    local ret="${?}"

    if [[ "${ret}" -eq 0 ]]; then
      echo "operation done"
      return 0
    else
      echo "operation failed. exit status was ${ret}"
      return ${ret}
    fi
  else
    echo "requested operation could not be executed" >&2
    return 1
  fi
}

add_contact () {
  local timestamp file email password ou
  timestamp=$(date +%s%N)
  email="${3}"
  ou="${4}"

  if [[ -n "${5}" ]]; then
    password="${5}"
  else
    password="default"
  fi


  sed "s/__SUFFIX__/${SUFFIX}/g;s/__ID__/${ID}/g;s/__NAME__/${NAME}/g;s/__EMAIL__/${email}/g;s/__PASSWORD__/${password}/g;s/__OU__/${ou}/g" "${RESDIR}/contact.add.ldif" > "/tmp/${timestamp}_cadd.ldif"
  file="/tmp/${timestamp}_cadd.ldif"

  "${LD_MODIFY}" -D "${LOGIN}" -w "${PASS}" -f "${file}"

  return ${?}

}

del_contact() {
  local timestamp mfile
  timestamp=$(date +%s%N)

  sed "s/__SUFFIX__/${SUFFIX}/g;s/__ID__/${ID}/g;s/__NAME__/${NAME}/g;s/__OU__/${ou}/g" "${RESDIR}/contact.delete.ldif" > "/tmp/${timestamp}_cdel.ldif"
  file="/tmp/${timestamp}_cdel.ldif"

  "${LD_MODIFY}" -D "${LOGIN}" -w "${PASS}" -f "${file}"

  return ${?}

}

usage() {
  echo -e \
  "Usage: $(basename "${0}") {add|del} NAME || {cadd|cdel} NAME email ou [password]\n" \
  "NAME : Identifier Name" \
  "ou   : people or machines"
  exit 1
}

get_name_by_email() {
  local mail name
  mail="${1}"

  name=($("${LD_SEARCH}" -D "${LOGIN}" -w "${PASS}" -LLL -b "ou=machines,${SUFFIX}" mail="${mail}" givenName sn | awk 'BEGIN{FS=":: ";c="base64 -d"}{if(/\w+:: /) {print $2 |& c; close(c,"to"); c |& getline $2; close(c); printf("%s: %s\n", $1, $2); next} print $0 }'  |grep 'givenName\|sn'| cut -d ':' -f 2 | tr -d ' '))

  echo "${name[@]}"

}

case ${1} in
  add)
    shift
    if [[ "${#}" -ne 2 ]]; then
      usage
    fi

    add_entry "${@}"

    exit "${?}"
    ;;

  del)
    shift
    if [[ ${#} -lt 2 ]]; then
      usage
    fi

    delete_entry "${@}"

    exit "${?}"
    ;;

  cadd)
    shift
    if [[ ${#} -lt 4 ]]; then
      usage
    fi

    add_contact "${@}"

    exit "${?}"
    ;;

  cdel)
    shift
    if [[ ${#} -ne 3 ]]; then
      usage
    fi

    del_contact "${@}"

    exit ${?}
    ;;

  getbyemail)
    shift
    if [[ ${#} -ne 1 ]]; then
      usage
    fi

    name=$(get_name_by_email "${@}")

    echo "${name}"
    exit 0
    ;;

  *)
    usage
    ;;
esac
