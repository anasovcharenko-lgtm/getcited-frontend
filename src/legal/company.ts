// Statutory company details.
//
// Required on every page of the site by:
//   - Companies Act 2006 s.82 and the Company, LLP and Business (Names and
//     Trading Disclosures) Regulations 2015 — registered name, number, place of
//     registration, registered office
//   - Electronic Commerce (EC Directive) Regulations 2002 reg.6 — name,
//     geographic address, email, registration details, VAT number if registered
//
// Kept in its own module so the landing pages can show the footer without
// importing the full text of every legal document.

export const COMPANY = {
  name: "Absolute One Ltd",
  number: "17362397",
  registeredIn: "England and Wales",
  address: "College House, 17 King Edwards Road, Ruislip, England, HA4 7AE",
  email: "hi@absoluteone.ltd",
  // Empty until VAT-registered. Showing a VAT number you do not hold, or the
  // word "pending", is worse than showing nothing: reg.6 only requires the
  // number if you are registered.
  vat: "",
};

export const companyLine = (brand: string) =>
  `${brand} is a trading name of ${COMPANY.name}, registered in ${COMPANY.registeredIn}, ` +
  `company number ${COMPANY.number}. Registered office: ${COMPANY.address}.` +
  (COMPANY.vat ? ` VAT number ${COMPANY.vat}.` : "");
