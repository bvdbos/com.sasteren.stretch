"use strict";

const Homey = require('homey');
const http = require('http');

class CircleDriver extends Homey.Driver {

  async onInit() {
    this.log('Circle Driver has been initialized');
  }

  /**
   * NIEUW: Deze functie ontvangt de XML van app.js en verdeelt het
   * Dit is de kern van de centrale polling.
   */
updateDevicesData(xmlData) {
  const devices = this.getDevices();
  const applianceBlocks = xmlData.split('<appliance ');
  
  // Log hoeveel blokken we hebben gevonden
  this.log(`[Driver] XML gesplitst in ${applianceBlocks.length} blokken.`);

devices.forEach(device => {
  const id = device.getData().id;
  // Zoek het blok waar het ID in voorkomt
  const myBlock = applianceBlocks.find(block => block.includes(id));
  
  if (myBlock) {
    // Geef het XML-blok door aan het device voor status-updates (verbruik/relais)
    device.onDataUpdate(myBlock);
  } else {
    this.log(`[Driver] GEEN match gevonden in XML voor device: ${device.getName()} (ID: ${id})`);
  }
});
}


async updateAppliance(device, isLocked) {
  // Gebruik de exacte ID's uit je app.json settings
  const address = this.homey.settings.get('ip_address');
  const stretchId = this.homey.settings.get('stretch_id');
  
  if (!address || !stretchId) {
    this.error("Configuratie ontbreekt: check IP en Stretch ID in de app instellingen.");
    throw new Error("Configuratie incompleet");
  }

  const url = `http://${address}/core/appliances`;
// Zorg dat deviceId een schone string is zonder extra quotes
  const deviceId = device.getData().id.replace(/"/g, ''); 
  const deviceName = device.getName();
  const deviceType = device.getData().type || 'circle';

const xmlBody = `
<appliances>
  <appliance id="${deviceId}">
    <name><![CDATA[${deviceName}]]></name>
    <actuators>
      <relay>
        <lock>${isLocked}</lock>
      </relay>
    </actuators>
  </appliance>
</appliances>`.trim();

  // De autorisatie zoals de Stretch die verwacht
  const authHeader = 'Basic ' + Buffer.from(`stretch:${stretchId}`).toString('base64');

  this.log(`Sync naar Stretch (${address}): Name="${deviceName}", Lock=${isLocked}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml',
      'Authorization': authHeader
    },
    body: xmlBody
  });

  if (!response.ok) {
    const errorBody = await response.text();
    this.error(`Stretch weigert update (Status: ${response.status}):`, errorBody);
    throw new Error(`Stretch update mislukt`);
  }

  this.log(`Stretch succesvol bijgewerkt voor ${deviceName}`);
  return true;
}

  // --- PAIRING LOGICA (Jouw bestaande code) ---
  
  async onPair(session) {
    this.log('[Pairing] Pairing sessie gestart');

    session.setHandler('list_devices', async () => {
      this.log('[Pairing] Lijst opvragen voor de wizard...');
      const devices = await this.onPairListDevices();
      this.log(`[Pairing] We sturen ${devices.length} apparaten naar de wizard.`);
      return devices;
    });

    session.setHandler('add_devices', async (data) => {
      this.log('[Pairing] Gebruiker heeft deze apparaten aangevinkt:', data);
      return data;
    });
  }

  async onPairListDevices() {
    this.log('[Pairing] onPairListDevices aangeroepen...');

    const ip = this.homey.settings.get('ip_address');
    const stretchId = this.homey.settings.get('stretch_id');
    
    if (!ip || !stretchId) {
      this.error('[Pairing] Fout: IP of Stretch ID ontbreekt.');
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
            const idMatch = block.match(/id=["'](.*?)["']/i);

            if (nameMatch && idMatch) {
              const name = nameMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim();
              const id = idMatch[1].trim();

              devices.push({
                name: name,
                data: { id: `${id}` }
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
  
  async setLock(device, isLocked) {
  const url = `http://${this.homey.settings.get('address')}/core/appliances`;
  const deviceId = device.getData().id;
  const deviceName = device.getName();

  // De exacte XML structuur zoals de Stretch die accepteert
  const xmlBody = `
    <appliances>
      <appliance id="${deviceId}">
        <name><![CDATA[${deviceName}]]></name>
        <description><![CDATA[]]></description>
        <type><![CDATA[circle]]></type>
        <actuators>
          <relay>
            <lock>${isLocked}</lock>
          </relay>
        </actuators>
      </appliance>
    </appliances>
  `.trim();

  this.log(`Versturen hardware lock naar Stretch voor ${deviceName}: ${isLocked}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml',
      'Authorization': 'Basic ' + Buffer.from('admin:' + this.homey.settings.get('password')).toString('base64')
    },
    body: xmlBody
  });

  if (!response.ok) {
    const errorText = await response.text();
    this.error('Stretch POST Error:', errorText);
    throw new Error(`Stretch lock fout: ${response.status}`);
  }

  this.log(`Lock succesvol doorgevoerd voor ${deviceName}`);
  return true;
}
}

module.exports = CircleDriver;