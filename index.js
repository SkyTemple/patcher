const CLEAN_US_SHA1 = '5fa96ca8d8dd6405d6cd2bad73ed68bc73a9d152';
const CLEAN_EU_SHA1 = 'c838a5adf1ed32d2da8454976e5b1a1aa189c139';

class UserError extends Error {}
class HttpStatusError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function downloadPatch(url, defaultRegion) {
  console.log(`Downloading patch '${url}'...`)

  const result = await fetch(url);
  if (!result.ok) {
    throw new HttpStatusError(`Failed to fetch patch '${url} (code ${result.status})'`, result.status);
  }

  const patch = new Uint8Array(await result.arrayBuffer());

  // The region header, if set, has priority over the region passed as a query parameter.
  const region = result.headers['X-SkyTemple-Region'] || defaultRegion;
  return { patch, region };
}

function applyPatch(romBytes, patchBytes) {
  console.log('Applying the patch...');

  const romFile = new MarcFile(romBytes);
  const patchFile = new MarcFile(patchBytes);
  return new VCDIFF(patchFile).apply(romFile)._u8array;
}

async function ensureCleanRom(rom, romRegion) {
  const expectedSha1 = getCleanSha1ForRegion(romRegion);
  const romSha1 = sha1(rom);
  console.log(`[cleaning] ROM sha1: ${romSha1}, expected sha1: ${expectedSha1}`);

  if (expectedSha1 !== romSha1) {
    try {
      const { patch } = await downloadPatch(`patches/${romRegion}/from/${romSha1.toUpperCase()}.xdelta`);
      return applyPatch(rom, patch);
    } catch (e) {
      if (e instanceof HttpStatusError && e.statusCode == 404) {
        // An unsupported dump was provided if no patch was found
        throw new UserError(`The provided ROM is incompatible. Please try again with a clean ROM. (Checksum of the provided ROM: "${romSha1}")`);
      } else {
        throw e;
      }
    }
  } else {
    return rom;
  }
}

async function ensureExpectedRegion(rom, romRegion, expectedRegion) {
  console.log(`ROM region: ${romRegion}, expected region: ${expectedRegion}`);

  if (romRegion !== expectedRegion) {
    const { patch } = await downloadPatch(`patches/${romRegion}-to-${expectedRegion}.xdelta`);
    return applyPatch(rom, patch);
  } else {
    return rom;
  }
}

function getAndCheckRomRegion(rom) {
  // Read ROM region from gamecode (see http://problemkaputt.de/gbatek.htm#dscartridgeheader)
  const regionCode = String.fromCharCode(rom[0xF]);
  if (regionCode === 'E') { // US ("English")
    return 'us';
  } else if (regionCode === 'P') { // Europe
    return 'eu';
  } else if (regionCode === 'J') { // Japan
    return 'jp';
  } else {
    throw new UserError('The region of your ROM is not supported. Only US, EU and Japanese roms are currently supported.');
  }
}

function downloadFile(bytes, name) {
  const blob = new Blob([bytes], { type: 'application/octet-stream' });

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${name || 'patched'}.nds`;
  link.click();

  URL.revokeObjectURL(link.href);
}

function getCleanSha1ForRegion(region) {
  return region === 'us' ? CLEAN_US_SHA1 : CLEAN_EU_SHA1;
}

function getPatchNameFromUrl(url) {
  const lastSegment = url.includes('/') ? url.split('/').pop() : url;

  // Return the file name without extension
  return lastSegment.includes('.')
    ? lastSegment.substr(0, lastSegment.lastIndexOf('.'))
    : lastSegment;
}

function reportError(error) {
  let text = '';
  if (error.message && error.message.includes('not implemented')) {
    // "Not implemented" error from the VCDiff library
    text = 'This patch is not supported. Please ask the ROM hack author to provide a compatible patch and include the error details below:<br><br>';
  } else if (!(error instanceof UserError)) {
    text = 'An error occured. Please report this error in the <a href="https://discord.gg/skytemple">SkyTemple Discord</a>.<br><br>';
  }
  document.getElementById('error').innerHTML = `${text}${error}`;
}

document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('rom-file');
  const submitButton = document.getElementById('submit');

  const params = new URLSearchParams(window.location.search);

  const patchName = params.get('name');
  const region = params.get('region') || 'us';
  const patchUrl = patchName ? `https://hacks.skytemple.org/api/hack/${patchName}` : params.get('url');
  const validationSha1 = params.get('sha1');
  const clean = params.has('clean');

  if (!patchUrl && !clean) {
    // No patch name or URL was passed as a parameter
    window.location.href = 'https://hacks.skytemple.org';
    return;
  }

  fileInput.addEventListener('change', () => {
    submitButton.disabled = !fileInput.files 
      || !fileInput.files.length
      || !fileInput.files[0].name.endsWith('.nds');
  });

  submitButton.addEventListener('click', async () => {
    submitButton.disabled = true;
    submitButton.innerText = 'Patching (1/7)...';
    document.getElementById('error').innerText = '';
    
    try {
      const file = fileInput.files[0];

      const reader = new FileReader();
      const readPromise = new Promise((resolve, reject) => {
        reader.onload = evt => resolve(new Uint8Array(evt.target.result));
        reader.onerror = error => reject(error);
      });
      
      reader.readAsArrayBuffer(file);
      
      const rom = await readPromise;

      let patch, patchRegion;
      if (patchUrl) {
        submitButton.innerText = 'Patching (2/7)...';
        const { patch: downloadedPatch, region } = await downloadPatch(patchUrl, region);
        patch = downloadedPatch;
        patchRegion = region;
      }

      submitButton.innerText = 'Patching (3/7)...';
      const romRegion = getAndCheckRomRegion(rom);
      const cleanRom = await ensureCleanRom(rom, romRegion);

      let patchedRom = cleanRom;
      if (patchUrl) {
        submitButton.innerText = 'Patching (4/7)...';
        const romInExpectedRegion = await ensureExpectedRegion(cleanRom, romRegion, patchRegion);

        submitButton.innerText = 'Patching (5/7)...';
        await new Promise(resolve => setTimeout(resolve, 20)); // Update the UI

        const expectedSha1 = getCleanSha1ForRegion(patchRegion);
        console.log(`Validating checksum against clean SHA-1 "${expectedSha1}"`);
        const romSha1 = sha1(romInExpectedRegion);
        if (romSha1 !== expectedSha1) {
          throw new Error(`Failed to clean rom or transition region (checksum mismatch: ${romSha1})`);
        }

        submitButton.innerText = 'Patching (6/7)...';
        await new Promise(resolve => setTimeout(resolve, 20)); // Update the UI

        console.log('Applying the ROM hack patch...');
        patchedRom = applyPatch(romInExpectedRegion, patch);
      }

      if (validationSha1) {
        submitButton.innerText = 'Patching (7/7)...';
        console.log(`Validating checksum against user-provided validation SHA-1 "${expectedSha1}"`);
        const patchedRomSha1 = sha1(patchedRom);
        if (patchedRomSha1 !== validationSha1.toLowerCase()) {
          throw new Error(`Failed to patch ROM (checksum mismatch: ${patchedRomSha1})`);
        }
      }

      const name = patchName || patchUrl ? getPatchNameFromUrl(patchUrl) : 'clean';
      downloadFile(patchedRom, name);
    } catch (e) {
      reportError(e);
      console.error(e);
    } finally {
      submitButton.disabled = false;
      submitButton.innerText = 'Apply Patch';
    }
  });
});
