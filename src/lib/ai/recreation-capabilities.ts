export const recreationCapabilities = {
  activities: {
    assistance:
      "Live discovery and reviewed zero-dollar activity enrollment; resident sign-in and waivers.",
    guideUrl:
      "https://www.toronto.ca/explore-enjoy/parks-recreation/how-to-use-our-services/how-to-register-for-recreation-programs/online-registration-booking/",
  },
  tennis: {
    assistance:
      "Live court listings and a resident-controlled one-hour reservation flow, with a maximum total chosen by the resident and official permit/account verification. Availability requires City sign-in. The resident completes all legal approvals and payment.",
    guideUrl:
      "https://www.toronto.ca/services-payments/venues-facilities-bookings/booking-park-recreation-facilities/online-booking-information-conditions/",
  },
  facilities: {
    assistance:
      "Official discovery and booking guidance. Facility types beyond the implemented tennis flow are completed directly with the City; do not claim an automated reservation.",
    guideUrl:
      "https://www.toronto.ca/services-payments/venues-facilities-bookings/booking-park-recreation-facilities/simple-permit-booking/",
  },
  memberships: {
    assistance:
      "Official membership discovery and purchase guidance. Membership purchase, paid activity enrollment, account changes and cancellations are resident-controlled City operations, outside the implemented transaction adapters.",
    guideUrl:
      "https://www.toronto.ca/explore-enjoy/parks-recreation/how-to-use-our-services/how-to-register-for-recreation-programs/online-registration-booking/",
  },
} as const;
