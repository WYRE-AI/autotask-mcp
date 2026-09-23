import { formatCompactResponse } from '../src/utils/response.formatter';

describe('formatCompactResponse - contacts', () => {
  test('surfaces primaryContact ("Is Primary") and billingContact ("Is Billing Contact") on compact contact results', () => {
    const contacts = [
      { id: 1, firstName: 'Matthew', lastName: 'Armstead', emailAddress: 'marmstead@eeaengineers.com', companyID: 2167, primaryContact: true, billingContact: false },
      { id: 2, firstName: 'Terri', lastName: 'Rabbitts', emailAddress: 'terri@eeaengineers.com', companyID: 2167, primaryContact: false, billingContact: true },
    ];

    const compact = formatCompactResponse(contacts, 'contacts', {});

    expect(compact.items[0]).toMatchObject({ id: 1, primaryContact: true, billingContact: false });
    expect(compact.items[1]).toMatchObject({ id: 2, primaryContact: false, billingContact: true });
  });

  test('omits primaryContact/billingContact when the source record does not have them', () => {
    const contacts = [{ id: 3, firstName: 'No', lastName: 'Flag', emailAddress: 'nf@example.com', companyID: 1 }];

    const compact = formatCompactResponse(contacts, 'contacts', {});

    expect(compact.items[0]).not.toHaveProperty('primaryContact');
    expect(compact.items[0]).not.toHaveProperty('billingContact');
  });
});
