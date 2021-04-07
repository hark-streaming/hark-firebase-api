# Firebase API
Run `npm i` inside of the main folder and the functions folder.  
Be sure to install the firebase tools onto your computer with `npm i firebase-tools -g`.  


# Firebase Emulator
You can run the firestore emulator with `npm run serve` while in the functions folder to get an empty emulator.
You can run `npm run dev` to start the emulator with a firebase imported
Run the command `firebase emulators:export ./emulator_firestore` to export the current emulator firestore

## Deploying
First you have to run `firebase login` to log in to your hark email. If you don't have access 
and think you should, contact kevin.xu@hark.tv.  

After logging in, run `npm run deploy:dev` to deploy the code to the live dev server.  
You can run `npm run deploy:prod` to deploy the code to the live production server.  
