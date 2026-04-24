"use strict";

const Homey = require('homey');
const http = require('http');

class CircleDriver extends Homey.Driver {

  async onInit() {
    this.log('Circle Driver has been initialized');
  }

  // Deze methode vervangt de hele session.setHandler rompslomp
  async onPairListDevices() {
    this.log('[Pairing] onPairListDevices aangeroepen...');

    const ip = this.homey.settings.get('ip_address');
    const stretchId = this.homey.settings.get('stretch_id');
	
	// 1. Eerst controleren of we de data wel hebben
  if (!ip || !stretchId) {
    this.error('[Pairing] Fout: IP of Stretch ID ontbreekt in instellingen.');
    
    // Deze Error wordt door de Homey App opgevangen en als rode balk getoond
    throw new Error('Configureer eerst het IP-adres en de Stretch ID in de app-instellingen.');
  }
	
    const auth = Buffer.from(`stretch:${stretchId}`).toString('base64');

    return new Promise((resolve, reject) => {
      const options = {
        host: ip,
        path: '/core/appliances',
        method: 'GET',
        headers: { 'Authorization': `Basic ${auth}` },
        timeout: 10000
      };

      http.get(options, (res) => {
        let xml = '';
        res.on('data', (chunk) => { xml += chunk; });
        res.on('end', () => {
          const devices = [];
          const applianceBlocks = xml.split('<appliance ');
          applianceBlocks.shift();

          applianceBlocks.forEach(block => {
            const nameMatch = block.match(/<name>(.*?)<\/name>/);
            const idMatch = block.match(/id=["']([a-f0-9]+)["']/i);

            if (nameMatch && idMatch) {
              const name = nameMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim();
              const id = idMatch[1].trim();

              devices.push({
                name: name,
                data: { id: id }
              });
            }
          });

          this.log(`[Pairing] ${devices.length} apparaten gevonden.`);
          resolve(devices);
        });
      }).on('error', (err) => {
        this.error('HTTP Error:', err);
        reject(err);
      });
    });
  }
}

module.exports = CircleDriver;