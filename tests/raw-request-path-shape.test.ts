import { rawRequestPathShape } from '../src/services/autotask-http';

describe('rawRequestPathShape', () => {
  it.each([
    ['/Companies/query', '/Companies/query'],
    ['/Tickets/123/Notes', '/Tickets/:x/Notes'],
    ['/Tickets/123/TicketNotes', '/Tickets/:x/TicketNotes'],
    ['/Tickets/123?includeFields=id,title', '/Tickets/:x'],
    ['/ServiceCalls/9/ServiceCallTickets/42', '/ServiceCalls/:x/ServiceCallTickets/:x'],
    ['/Things/0f8fad5b-d9cb-469f-a165-70867728950e', '/:x/:x'],
    ['/Tickets/entityInformation/fields', '/Tickets/entityInformation/fields'],
  ])('%s -> %s', (input, expected) => {
    expect(rawRequestPathShape(input)).toBe(expected);
  });

  // Free-text segments must never pass through (security review on #387).
  it.each([
    ['/Tickets/T20261119.0001', '/Tickets/:x'],
    ['/Contacts/jane.doe@acme.com', '/Contacts/:x'],
    ['/Companies/Acme Corp/Contacts', '/Companies/:x/Contacts'],
    ['/Resources/jdoe', '/Resources/:x'],
    ['/Tickets/query/{"filter":[{"op":"eq","field":"title","value":"Acme VPN down"}]}', '/Tickets/query/:x'],
  ])('collapses free text in %s', (input, expected) => {
    const out = rawRequestPathShape(input);
    expect(out).toBe(expected);
    expect(out).not.toMatch(/acme|jane|jdoe|T2026|VPN/i);
  });

  it('does not treat verbs or entities as free text in the wrong position', () => {
    expect(rawRequestPathShape('/query/Tickets')).toBe('/:x/Tickets');
  });

  it('strips control characters and semicolons before matching', () => {
    expect(rawRequestPathShape('/Tick\nets;/1')).toBe('/Tickets/:x');
    expect(rawRequestPathShape('/Tickets/a\u0000b;c')).toBe('/Tickets/:x');
  });

  it('decodes %-encoding before matching and collapses bad encoding', () => {
    expect(rawRequestPathShape('/Companies/Acme%20Corp')).toBe('/Companies/:x');
    expect(rawRequestPathShape('/%54ickets/1')).toBe('/Tickets/:x');
    expect(rawRequestPathShape('/Tickets/%E0%A4%A')).toBe('/:x');
  });
});
