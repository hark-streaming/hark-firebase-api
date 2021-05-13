import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import axios from "axios";

/* ----- HELPER FUNCTIONS FOR REGISTRATION -----*/

/**
 * Helper function to query whether a username is unique or not
 * TODO: probably a more efficient way to check username
 */
 export async function checkUsernameExists(username: string) {
    // the firestore
    const db = admin.firestore();

    // grab the doc that has all usernames
    // inside info, there is an array called usernames that holds all usernames
    const infoDoc = await db.collection("users").doc("info").get();
    if (!infoDoc.exists) {
        await db.collection("users").doc("info").set({
            usernames: []
        });
    }
    const infoData = infoDoc.data();
    const usernames = infoData?.usernames;

    let filter = usernames.filter((n: string) => n.toLowerCase() == username.toLowerCase());
    if (filter.length > 0) {
        return true;
    } else {
        return false;
    }
}

/**
 * Verifies the hCaptcha with hCaptcha
 * Returns true if successful
 */
export async function verifyCaptcha(token: string) {
    // Verify captcha token with hcaptcha
    const params = new URLSearchParams();
    params.append('response', token);
    params.append('secret', functions.config().hcaptcha_secret.key);
    const hcaptchaRes = await axios.post('https://hcaptcha.com/siteverify', params);

    return hcaptchaRes.data.success;
}

/**
 * Registers a user to firebase given the required information
 * @param username 
 * @param email 
 * @param password 
 * @param role 
 * @param ein 
 * @param name 
 * @param phone 
 * @param tags 
 * @returns 
 */
export async function registerUser(username: string, email: string, password: string, role: string, ein: number, name: string, phone: number, tags: string[]) {
    // the firestore
    const db = admin.firestore();

    // register the user with email, password, username
    // TODO: better error handling (maybe add a middleware?)
    let userRecord = await admin.auth().createUser({
        email: email,
        emailVerified: false,
        password: password,
        displayName: username,
        photoURL: 'http://www.example.com/12345678/photo.png',
        disabled: false,
    });

    // create theta wallets for the user
    const vaultWallet = await generateVaultWallet(userRecord.uid);

    // if they are a default user (viewer)
    // add an entry into the firestore with their data
    await db.collection("users").doc(userRecord.uid).set({
        uid: userRecord.uid,
        username: username,
        email: email,
        streamkey: "",
        ein: ein,
        name: name,
        phone: phone,
        vaultWallet: vaultWallet,
    });

    // add their username into another doc to track it
    const arrayUnion = admin.firestore.FieldValue.arrayUnion;
    await db.collection("users").doc("info").update({
        usernames: arrayUnion(username)
    });

    // if they are a streamer
    // add an entry into the firestore with their data
    // create a stream doc in the firestore
    if (role == "streamer") {
        await createStreamDoc(username, userRecord.uid, tags);
    }

    // if they are a politician
    // add an entry into the firestore with their data
    // create a stream doc in the firestore


    // return a json response
    return {
        success: true,
        status: 200,
        message: "oh yeah user registered"
    };
}

/**
 * Creates a streamer doc in the firebase given proper data
 */
export async function createStreamDoc(username: string, uid: string, tags: string[]) {
    // the firestore
    const db = admin.firestore();

    await db.collection("streams").doc(username.toLowerCase()).set({
        title: username,
        description: "Default description!",
        timestamp: Date.now(),
        poster: "https://media.discordapp.net/attachments/814278920168931382/819072942507556914/hark-logo-high-res.png?width=1025&height=280",
        thumbnail: "https://cdn.discordapp.com/attachments/814278920168931382/820548508192342056/hrk.png",
        live: false,
        nsfw: false,
        archive: false,
        url: "https://stream.hark.tv/hls/" + username + ".m3u8",
        name: username,
        owner: uid,
        avatar: "https://media.discordapp.net/attachments/814278920168931382/819073087021776906/hark-logo-h-high-res.png?width=499&height=499",
        to: "/channel/" + username,
        banned: false,
        tags: tags,
        donateMsg: "Donate",
        donateOn: false,
        donateUrl: "https://hark.tv/",
    });

    function generateP() {
        var pass = '';
        var str = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
            'abcdefghijklmnopqrstuvwxyz0123456789';

        for (let i = 1; i <= 8; i++) {
            var char = Math.floor(Math.random()
                * str.length + 1);

            pass += str.charAt(char)
        }

        return pass;
    }

    await db.collection("users").doc(uid).update({
        streamkey: generateP(),
    });

    return {
        success: true,
        status: 200,
        message: "oh yeah streamer registered"
    };
}

/**
 * Generate a vault wallet for a user using theta's services
 */
export async function generateVaultWallet(uid: String) {

    // call theta's partner api to get a wallet
    let req = await axios.get(`https://api-partner-testnet.thetatoken.org/user/${uid}/wallet`, {
        headers: {
            "x-api-key": functions.config().theta.xapikey
        }
    });
    return req.data.body.address;
}