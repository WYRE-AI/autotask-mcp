import {
  WYRE_ROOT_COMPANY_ID,
  buildTicketSearchParams,
  extractCompanyName,
  extractCreatedAfter,
  extractTicketNumberPrefix,
  resolveCompanyId,
  type CompanySearcher,
} from '../src/handlers/intent-router';

const FIXED_NOW = new Date('2026-09-19T15:32:00Z');
const TODAY = '2026-09-19';

const failIfCalled: CompanySearcher = async () => {
  throw new Error('searchCompanies should not be called');
};

describe('intent-router ticket search helpers', () => {
  test('extractCreatedAfter uses the UTC date for "today"', () => {
    expect(extractCreatedAfter('tickets today', FIXED_NOW)).toBe(TODAY);
    expect(extractCreatedAfter('tickets at WYRE today', FIXED_NOW)).toBe(TODAY);
    expect(extractCreatedAfter('open tickets', FIXED_NOW)).toBeUndefined();
  });

  test('extractTicketNumberPrefix matches Autotask ticket-number prefixes only', () => {
    expect(extractTicketNumberPrefix('search tickets for T20260917')).toBe('T20260917');
    expect(extractTicketNumberPrefix('tickets for T20260917.0042')).toBe('T20260917.0042');
    expect(extractTicketNumberPrefix('tickets for Amaero')).toBeUndefined();
    expect(extractTicketNumberPrefix('tickets today')).toBeUndefined();
  });

  test('extractCompanyName takes at/for/from phrases and quoted names, never ticket numbers or "today"', () => {
    expect(extractCompanyName('tickets at WYRE today')).toBe('WYRE');
    expect(extractCompanyName('tickets at WYRE Technology today')).toBe('WYRE Technology');
    expect(extractCompanyName('tickets for Amaero')).toBe('Amaero');
    expect(extractCompanyName('find tickets for Acme Corp')).toBe('Acme Corp');
    expect(extractCompanyName('tickets for "Amaero Additive"')).toBe('Amaero Additive');
    expect(extractCompanyName('tickets today')).toBeUndefined();
    expect(extractCompanyName('tickets for today')).toBeUndefined();
    expect(extractCompanyName('search tickets for T20260917')).toBeUndefined();
    expect(extractCompanyName('search tickets for "T20260917"')).toBeUndefined();
  });

  test('resolveCompanyId maps WYRE aliases to root company 0 without calling the API', async () => {
    await expect(resolveCompanyId('WYRE', failIfCalled)).resolves.toBe(WYRE_ROOT_COMPANY_ID);
    await expect(resolveCompanyId('wyre technology', failIfCalled)).resolves.toBe(0);
  });

  test('resolveCompanyId uses a unique searchCompanies hit', async () => {
    const search: CompanySearcher = async (term) => {
      expect(term).toBe('Amaero');
      return [{ id: 296, companyName: 'Amaero Additive' }];
    };
    await expect(resolveCompanyId('Amaero', search)).resolves.toBe(296);
  });

  test('resolveCompanyId prefers an exact name among multiple hits', async () => {
    const search: CompanySearcher = async () => [
      { id: 1, companyName: 'Amaero Additive' },
      { id: 2, companyName: 'Amaero' },
    ];
    await expect(resolveCompanyId('Amaero', search)).resolves.toBe(2);
  });

  test('resolveCompanyId returns undefined when the name cannot be uniquely resolved', async () => {
    const none: CompanySearcher = async () => [];
    const many: CompanySearcher = async () => [
      { id: 1, companyName: 'Amaero Additive' },
      { id: 2, companyName: 'Amaero Machining' },
    ];
    const boom: CompanySearcher = async () => {
      throw new Error('API down');
    };
    await expect(resolveCompanyId('Amaero', none)).resolves.toBeUndefined();
    await expect(resolveCompanyId('Amaero', many)).resolves.toBeUndefined();
    await expect(resolveCompanyId('Amaero', boom)).resolves.toBeUndefined();
  });

  test('tickets today → createdAfter UTC date, no searchTerm', async () => {
    const route = await buildTicketSearchParams('tickets today', failIfCalled, FIXED_NOW);
    expect(route.suggestedParams).toEqual({ createdAfter: TODAY });
    expect(route.requiredParams).toEqual([]);
  });

  test('tickets at WYRE today → companyID 0 and createdAfter, no API', async () => {
    const route = await buildTicketSearchParams('tickets at WYRE today', failIfCalled, FIXED_NOW);
    expect(route.suggestedParams).toEqual({ companyID: 0, createdAfter: TODAY });
    expect(route.requiredParams).toEqual([]);
  });

  test('tickets for Amaero → companyID from searchCompanies, never searchTerm', async () => {
    const search: CompanySearcher = async (term) => {
      expect(term).toBe('Amaero');
      return [{ id: 296, companyName: 'Amaero' }];
    };
    const route = await buildTicketSearchParams('tickets for Amaero', search, FIXED_NOW);
    expect(route.suggestedParams).toEqual({ companyID: 296 });
    expect(route.suggestedParams.searchTerm).toBeUndefined();
    expect(route.requiredParams).toEqual([]);
  });

  test('search tickets for T20260917 → searchTerm only', async () => {
    const route = await buildTicketSearchParams('search tickets for T20260917', failIfCalled, FIXED_NOW);
    expect(route.suggestedParams).toEqual({ searchTerm: 'T20260917' });
    expect(route.requiredParams).toEqual([]);
  });

  test('unresolved company omits searchTerm and requires companyID', async () => {
    const search: CompanySearcher = async () => [];
    const route = await buildTicketSearchParams('tickets for Amaero', search, FIXED_NOW);
    expect(route.suggestedParams).toEqual({});
    expect(route.requiredParams).toEqual(['companyID']);
  });
});
