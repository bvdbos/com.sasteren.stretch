"use strict";

const Homey = require('homey');
const http = require('http');

class CircleDevice extends Homey.Device {

  async onInit() {
    this.log(`Circle Device ${this.getName()} is geïnitialiseerd (v1.1)`);
// Controleer of de capability 'meter_power' ontbreekt en voeg deze toe indien nodig
  if (!this.hasCapability('meter_power')) {
    this.log(`Adding missing capability: meter_power to ${this.getName()}`);
    await this.addCapability('meter_power').catch(this.error);
  }
    // Luister naar de aan/uit knop in de Homey App
    this.registerCapabilityListener('onoff', async (value) => {
      const ip = this.homey.settings.get('ip_address');
      const stretchId = this.homey.settings.get('stretch_id');
      const deviceId = this.getData().id;

      if (!stretchId) throw new Error('Stretch ID ontbreekt');

      const auth = Buffer.from(`stretch:${stretchId}`).toString('base64');
      const xmlBody = `<relay><state>${value ? 'on' : 'off'}</state></relay>`;

      const options = {
        host: ip,
        path: `/core/appliances;id=${deviceId}/relay`,
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'text/xml',
          'Content-Length': Buffer.byteLength(xmlBody)
        }
      };

      return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            if (value === false) {
              this.setCapabilityValue('measure_power', 0).catch(this.error);
            }
            resolve();
          } else {
            reject(new Error(`Stretch gaf status ${res.statusCode}`));
          }
        });
        req.on('error', reject);
        req.write(xmlBody);
        req.end();
      });
    });
  }

  // Deze functie wordt aangeroepen vanuit de Driver
onDataUpdate(myBlock) {
  this.log(`--- Update voor: ${this.getName()} ---`);

  // 1. Wattage (consumed W)
  // We zoeken specifiek naar het blok waar 'electricity_consumed' boven de unit 'W' staat
  const powerMatch = myBlock.match(/electricity_consumed<\/type>\s*<unit>W<\/unit>[\s\S]*?<measurement[^>]*?>([\d.]+)</);
  if (powerMatch) {
    const power = parseFloat(powerMatch[1]);
    this.log(`[Watt] ${power} W`);
    this.setCapabilityValue('measure_power', power).catch(this.error);
  }

  // 2. Totaalverbruik (consumed Wh)
  // We zoeken specifiek naar 'electricity_consumed' boven de unit 'Wh'
  const intervalMatch = myBlock.match(/electricity_consumed<\/type>\s*<unit>Wh<\/unit>[\s\S]*?<measurement[^>]*?>([\d.]+)</);
  if (intervalMatch) {
    const currentHourWh = parseFloat(intervalMatch[1]);
    let totalMeterKwh = this.getCapabilityValue('meter_power') || 0;
    let lastKnownHourWh = this.getStoreValue('last_hour_wh');

    if (lastKnownHourWh === null || lastKnownHourWh === undefined) {
      this.log(`[kWh] Eerste meting: ${currentHourWh / 1000} kWh`);
      this.setCapabilityValue('meter_power', currentHourWh / 1000).catch(this.error);
    } else if (currentHourWh > lastKnownHourWh) {
      const diffKwh = (currentHourWh - lastKnownHourWh) / 1000;
      totalMeterKwh += diffKwh;
      this.setCapabilityValue('meter_power', totalMeterKwh).catch(this.error);
    }
    
    this.setStoreValue('last_hour_wh', currentHourWh).catch(this.error);
    this.log(`[kWh] Stand: ${totalMeterKwh.toFixed(4)} kWh`);
  }

  // 3. Status (Aan/Uit)
  // We kijken naar de actuator relay state
  const relayMatch = myBlock.match(/<relay[\s\S]*?<state>(on|off)<\/state>/);
  if (relayMatch) {
    const isOn = relayMatch[1] === 'on';
    this.setCapabilityValue('onoff', isOn).catch(this.error);
  }

  // 4. Datums
  const stretchDateMatch = myBlock.match(/<created_date>([\d-T:.]+)/);
  if (stretchDateMatch) {
    const stretchDate = new Date(stretchDateMatch[1]).toLocaleDateString('nl-NL');
    this.setSettings({ install_date_stretch: stretchDate }).catch(this.error);
  }
}

} // <--- Deze sloot waarschijnlijk niet goed af

module.exports = CircleDevice;