const express = require('express');
const app = express()
const port = 5000
dotenv = require('dotenv');
dotenv.config();
const cors = require('cors');

app.use(cors());
app.use(express.json());    
app.get('/', (req, res) => {
  res.send('Hello World!')
})


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = process.env.MONGODB_URI;


const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect();
    const db = client.db("ticketGhor");
    const productsCollection = db.collection("products");
    const userCollection =  db.collection('user');
    
    app.post('/products', async (req, res) => {
        try {
            const product = req.body;
            console.log(product);
            const result = await productsCollection.insertOne(product);
            res.status(201).send(result);
        } catch (error) {
            console.error(error);
            res.status(500).send({ message: "Failed to add product" });
        }
   });
 
   app.get('/my-products/:email' , async(req , res) =>{
        const {email} = req.params;
        console.log(email);
        const result = await productsCollection.find({vendorEmail:email}).toArray();
        res.send(result);
   })

   app.get('/pending-tickets' , async(req , res)=>{
       const result = await productsCollection.find().toArray();
       res.send(result);
   })

   app.get('/users',async(req , res)=>{
        
      const result =await userCollection.find().toArray();
      res.send(result);

   })

    app.patch('/api/tickets/:id/status', async (req, res) => {
    try {
        const id = req.params.id;
        const { status } = req.body; // Extract the status sent from the frontend

        if (!status) {
        return res.status(400).send({ message: "Status is required" });
        }

        const result = await productsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: status } } // Correct $set syntax
        );

        res.status(200).send(result);
    } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Internal server error" });
    }


        




    });
    

   
    app.patch('/users/:email/role', async (req, res) => {
  try {
    const email = req.params.email;
    const { role } = req.body;

    if (!role) {
      return res.status(400).send({ message: "Role state is required" });
    }

    // Update user role matching directly by email address
    const result = await userCollection.updateOne(
      { email: email }, 
      { $set: { role: role } }
    );

    // Additional requirement logic: If vendor is marked as fraud, hide all their tickets
    if (role === "fraud") {
      await productsCollection.updateMany(
        { vendorEmail: email },
        { $set: { status: "rejected" } } // Or "rejected" depending on implementation
      );
    }

    res.status(200).send({ success: true, result });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Internal server error" });
  }
});










    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
     
  }
}
run().catch(console.dir);


app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})