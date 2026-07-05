const { resolveCountryFromIp, countryNameFromCode } = require('./geoipService');

describe('geoipService', () => {
  test('countryNameFromCode traduce códigos ISO', () => {
    expect(countryNameFromCode('PE')).toBeTruthy();
    expect(countryNameFromCode('XX')).toBeNull();
  });

  test('resolveCountryFromIp ignora IPs locales', () => {
    expect(resolveCountryFromIp('127.0.0.1')).toEqual({
      country_code: null,
      country_name: null
    });
  });

  test('resolveCountryFromIp resuelve IP pública con geoip-lite', () => {
    const geo = resolveCountryFromIp('8.8.8.8');
    expect(geo.country_code).toBeTruthy();
    expect(geo.country_name).toBeTruthy();
  });
});
