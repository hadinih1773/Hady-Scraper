
const servers = {
    "ID": "Indonesia", "IND": "India", "BD": "Bangladesh", "PK": "Pakistan",
    "SG": "Singapore", "TH": "Thailand", "VN": "Vietnam", "TW": "Taiwan",
    "BR": "Brazil", "NA": "North America", "EU": "Europe", "ME": "Middle East"
};

function formatTimestamp(timestamp) {
    if (!timestamp) return "—";
    const date = new Date(parseInt(timestamp) * 1000);
    return date.toLocaleString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function getServerName(region) {
    return servers[region] || region || "Unknown Server";
}

async function cekID(uid) {
    if (!uid || !/^\d+$/.test(uid)) {
        console.error("❌ UID harus berupa angka");
        return;
    }

    const url = `https://adenpedia.my.id/update01/info.php?uid=${uid}`;
    
    console.log(`\n🔄 Sedang mengambil data untuk UID: ${uid}...`);

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            signal: controller.signal
        });
        
        clearTimeout(timeout);

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error("UID tidak ditemukan (404)");
            }
            throw new Error(`HTTP Error: ${response.status}`);
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error("Response bukan JSON valid");
        }

        const data = await response.json();

        if (!data.basicInfo) {
            console.log("❌ UID tidak ditemukan atau data tidak valid.");
            return;
        }

        const basic = data.basicInfo;
        const clan = data.clanBasicInfo || {};
        const pet = data.petInfo || {};
        const social = data.socialInfo || {};
        const credit = data.creditScoreInfo || {};

        // Output Hasil
        console.log("\n=========================================");
        console.log("📱  DATA AKUN FREE FIRE (ADENPEDIA)");
        console.log("=========================================");
        console.log(`👤  Nickname   : ${basic.nickname}`);
        console.log(`🆔  UID        : ${basic.accountId}`);
        console.log(`🌍  Region     : ${getServerName(basic.region)} (${basic.region})`);
        console.log(`⭐  Level      : ${basic.level} (EXP: ${basic.exp.toLocaleString('id-ID')})`);
        console.log(`👍  Likes      : ${basic.liked.toLocaleString('id-ID')}`);
        console.log(`👑  Prime Lvl  : ${basic.primeInfo?.primeLevel || 0}`);
        console.log(`🏆  BR Rank    : ${basic.rank} (${basic.rankingPoints} Pts)`);
        console.log(`🎯  CS Rank    : ${basic.csRank} (${basic.csRankingPoints} Pts)`);
        console.log(`📅  Terdaftar  : ${formatTimestamp(basic.createAt)}`);
        console.log(`🕒  Login Akhir: ${formatTimestamp(basic.lastLoginAt)}`);
        console.log(`🛡️  Credit Score: ${credit.creditScore || '-'}`);
        console.log("-----------------------------------------");
        
        if (clan.clanName) {
            console.log(`🏰  Guild      : ${clan.clanName} (Lvl ${clan.clanLevel})`);
            console.log(`👥  Member     : ${clan.memberNum} / ${clan.capacity}`);
        } else {
            console.log(`🏰  Guild      : Tidak ada / Solo`);
        }

        if (pet.name) {
            console.log(`🐾  Pet        : ${pet.name} (Lvl ${pet.level})`);
        }

        if (social.signature) {
            console.log(`📝  Bio/Sign   : ${social.signature}`);
        }
        console.log("=========================================\n");

    } catch (error) {
        console.error(`❌ Terjadi kesalahan: ${error.message}`);
    }
}

// Test
if (require.main === module) {
    const uid = process.argv[2];
    if (!uid) {
        console.log("Usage: node ff.js <UID>");
        console.log("Example: node ff.js 123456789");
        process.exit(1);
    }
    cekID(uid);
}
