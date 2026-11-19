import { rawRequestPathShape } from '../src/services/autotask-http';

describe('rawRequestPathShape', () => {
  it.each([
    ['/Companies/query', '/Companies/query'],
    ['/Tickets/123/Notes', '/Tickets/:id/Notes'],
    ['/Tickets/123?includeFields=id,title', '/Tickets/:id'],
    ['/ServiceCalls/9/ServiceCallTickets/42', '/ServiceCalls/:id/ServiceCallTickets/:id'],
    ['/Things/0f8fad5b-d9cb-469f-a165-70867728950e', '/Things/:id'],
  ])('%s -> %s', (input, expected) => {
    expect(rawRequestPathShape(input)).toBe(expected);
  });
});
