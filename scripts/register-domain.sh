#!/usr/bin/env bash
set -euo pipefail
# Explicit input: a LOCAL contact JSON file in Route 53 ContactDetail format.
# Never commit this file. This script purchases a one-year registration with auto-renew.
CONTACT_FILE="${1:?Usage: register-domain.sh /private/path/contact.json}"
AVAILABILITY=$(aws route53domains check-domain-availability --region us-east-1 --domain-name localpdfsign.com --query Availability --output text)
if [[ "$AVAILABILITY" != 'AVAILABLE' ]]; then
  echo "localpdfsign.com cannot be registered: $AVAILABILITY" >&2
  exit 1
fi
aws route53domains list-prices --region us-east-1 --tld com --query 'Prices[0].{Registration:RegistrationPrice,Renewal:RenewalPrice}'
if [[ "${CONFIRM_DOMAIN_PURCHASE:-}" != 'localpdfsign.com' ]]; then
  echo 'Review the displayed price and set CONFIRM_DOMAIN_PURCHASE=localpdfsign.com to purchase.' >&2
  exit 1
fi
aws route53domains register-domain --region us-east-1 --domain-name localpdfsign.com --duration-in-years 1 --auto-renew \
 --admin-contact "file://$CONTACT_FILE" --registrant-contact "file://$CONTACT_FILE" --tech-contact "file://$CONTACT_FILE" \
 --privacy-protect-admin-contact --privacy-protect-registrant-contact --privacy-protect-tech-contact \
 --query OperationId --output text
