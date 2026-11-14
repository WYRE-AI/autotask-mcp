import { COMPACT_SEARCH_TOOLS, detectEntityType, formatCompactResponse } from '../src/utils/response.formatter';

describe('autotask_search_ticket_charges compact response', () => {
  const ticketCharge = {
    id: 42,
    ticketID: 48217,
    productID: 77,
    name: 'Fuse replacement',
    description: 'Replace the failed network fuse.',
    chargeType: 2,
    unitQuantity: 1,
    unitPrice: 25,
    unitCost: 18,
    billableToAccount: true,
    datePurchased: '2026-10-31T12:00:00Z',
    billingCodeID: 9,
    status: 1,
  };

  it('maps ticket charge tools to the charge entity type', () => {
    expect(detectEntityType('autotask_search_ticket_charges')).toBe('ticketCharges');
    expect(detectEntityType('autotask_search_tickets')).toBe('tickets');
    expect(COMPACT_SEARCH_TOOLS.has('autotask_search_ticket_charges')).toBe(true);
  });

  it('keeps charge details in the compact response', () => {
    const compact = formatCompactResponse([ticketCharge], 'ticketCharges', {});

    expect(compact.items[0]).toEqual({
      id: 42,
      ticketID: 48217,
      name: 'Fuse replacement',
      description: 'Replace the failed network fuse.',
      chargeType: 2,
      unitQuantity: 1,
      unitPrice: 25,
      unitCost: 18,
      billableToAccount: true,
      datePurchased: '2026-10-31T12:00:00Z',
      productID: 77,
      billingCodeID: 9,
      status: 1,
    });
  });
});
