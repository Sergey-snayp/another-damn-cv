import express, { Request, Response } from "express";

const app = express();
app.use(express.json());

// enum email, sms

type Contact = {
  id: string;
  email?: string;
  phoneNumber?: string;
  preferences: { // enum
    email: boolean;
    sms: boolean;
    another: boolean;
  };
};

type NotificationRequest = {
  message: string;
  contacts: Contact[];
};

type NotificationResponse = {
  contactId: string,
  channel: string,
  status: string,
}



const factoryMethod = (type: Contact['preferences']): INotificationVendor | undefined => {
  if(type.email === true) {
    return new EmailApi();
  }
  if(type.sms === true) {
    return new SmsApi();
  }

  if(type.another === true) {
    return new AnotherApi();
  }

  return undefined;
}

interface INotificationVendor {
  transportMethod: string; // enum
  send(methodType: string, message: string): Promise<void>;
}

class EmailApi implements INotificationVendor {
  transportMethod: string = 'email';

  async send(email: string, message: string): Promise<void> {
    console.log(`Email sent to ${email}: ${message}`);
  }
}

class SmsApi implements INotificationVendor{
  transportMethod: string = 'sms';

  async send(phoneNumber: string, message: string): Promise<void> {
    console.log(`SMS sent to ${phoneNumber}: ${message}`);
  }
}

class AnotherApi implements INotificationVendor{
  transportMethod: string = 'another';

  async send(anotherTransportMethod: string, message: string): Promise<void> {
    console.log(`SMS sent to ${anotherTransportMethod}: ${message}`);
  }
}

//endpoints - usecases - services 


app.post(
  "/notifications",
  async (
    request: Request<unknown, unknown, NotificationRequest>,
    response: NotificationResponse
  ) => {
    console.log("> notifications endpoint id", request.id);
    const results: NotificationResponse[] = [];

    for (const contact of request.body.contacts) {
      const notificationVendor = factoryMethod(contact.preferences); // get rid many instances
      
      try {
        if(!notificationVendor) {
          throw Error("Error: vendor not found id", request.id);
        } else {
          const transportMethod = contact[notificationVendor.transportMethod];
          
          await notificationVendor.send(transportMethod, request.body.message);
 
          results.push({
            contactId: contact.id,
            channel: notificationVendor.transportMethod, 
            status: "sent",
          });
        }
        } catch (error) {
          console.log("> notifications endpoint: Error: something happened");

          results.push({
            contactId: contact.id,
            channel: notificationVendor.transportMethod,
            status: "failed",
          });
        }


      // if (contact.preferences.sms && contact.phoneNumber) {
      //   try {
      //     await smsApi.send(contact.phoneNumber, request.body.message);
      //     results.push({
      //       contactId: contact.id,
      //       channel: "sms",
      //       status: "sent",
      //     });
      //   } catch (error) {
      //     results.push({
      //       contactId: contact.id,
      //       channel: "sms",
      //       status: "failed",
      //     });
      //   }
      // }
    }

    console.log("< notifications endpoint id", request.id);

    response.status(200).json({ results });
  }
);


app.listen(3000);

// Example requests:
const exampleRequestBody = {
  "message": "High temperature detected",
  "contacts": [
    {
      "id": "contact-1",
      "email": "alice@example.com",
      "phoneNumber": "+16045550101",
      "preferences": { "email": true, "sms": false }
    },
    {
      "id": "contact-2",
      "email": "bob@example.com",
      "phoneNumber": "+16045550102",
      "preferences": { "email": true, "sms": true }
    }
  ]
}

// Example response
const exampleResponseBody = {
  "results": [
    { "contactId": "contact-1", "channel": "email", "status": "sent" },
    { "contactId": "contact-2", "channel": "email", "status": "sent" },
    {
      "contactId": "contact-2",
      "channel": "sms",
      "status": "failed",
      "error": "SMS provider unavailable"
    }
  ]
}