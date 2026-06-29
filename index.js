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
    const bookingCollection = db.collection('bookings');
    const transactionCollection = db.collection('transactions');
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
    
    app.get('/tickets', async (req, res) => {
  try {
    // 1. Extract query parameters sent from the frontend
    const { from, to, transport, sort } = req.query;

    // 2. Initialize an empty query object. 
    // Best practice: Only show tickets that have been 'approved' by the admin.
    let query = { status: 'approved' }; 

    // 3. Dynamically build the search filters
    if (from) {
      // $regex allows for partial matches (e.g., "dha" matches "Dhaka")
      // $options: 'i' makes it case-insensitive
      query.from = { $regex: from, $options: 'i' }; 
    }
    
    if (to) {
      query.to = { $regex: to, $options: 'i' };
    }
    
    if (transport && transport !== 'all') {
      query.transport = transport.toLowerCase(); // Exact match for transport type
    }

    // 4. Determine sorting logic
    let sortOptions = {}; // Default is no sorting (insertion order)
    if (sort === 'price-asc') {
      sortOptions.price = 1; // 1 means ascending (Low to High)
    } else if (sort === 'price-desc') {
      sortOptions.price = -1; // -1 means descending (High to Low)
    }

    // 5. Execute the query in MongoDB
    const result = await productsCollection
      .find(query)
      .sort(sortOptions)
      .toArray();

    // 6. Send the filtered and sorted tickets back to the client
    res.status(200).send(result);

  } catch (error) {
    console.error("Failed to fetch tickets:", error);
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


    app.get('/tickets/:id',async(req , res)=>{
          const {id} = req.params;
          const result = await productsCollection.findOne({_id : new ObjectId(id)});
          res.send(result);
    })


    app.post('/bookings', async(req , res)=>{
         const {ticketId , quantity , userEmail} = req?.body;
         const Obj = {
             ticketId,
             quantity,
             userEmail,
             status:"pending"
         }   
         const result = await bookingCollection.insertOne(Obj);
         res.send(result);
    })
    

    app.get("/user/bookings/:email", async (req, res) => {
  try {
    const { email } = req.params;

    const result = await bookingCollection.aggregate([
      {
        $match: {
          userEmail: email,
        },
      },
      {
        $addFields: {
          ticketObjectId: {
            $toObjectId: "$ticketId",
          },
        },
      },
      {
        $lookup: {
          from: "products", 
          localField: "ticketObjectId",
          foreignField: "_id",
          as: "ticketInfo",
        },
      },
      {
        $unwind: {
          path: "$ticketInfo",
          preserveNullAndEmptyArrays: true // Prevents crashes if a ticket was deleted
        }
      },
      {
        $project: {
          _id: 1, 
          quantity: 1,
          
          // ── MAGIC FIX: If status doesn't exist in DB, default to "pending" ──
          status: { $ifNull: ["$status", "pending"] }, 
          
          totalPrice: {
            $multiply: [
              { $toInt: "$quantity" },
              { $toInt: "$ticketInfo.price" }
            ],
          },
          
          ticketId: {
            _id: "$ticketInfo._id",
            title: "$ticketInfo.title",
            from: "$ticketInfo.from",
            to: "$ticketInfo.to",
            departure: "$ticketInfo.departure",
            transport: "$ticketInfo.transport",
            imageUrl: "$ticketInfo.imageUrl",
            price: "$ticketInfo.price",
          },
        },
      },
    ]).toArray();

    res.send(result);
  } catch (err) {
    console.error("Aggregation Error:", err);
    res.status(500).send({ message: "Failed to fetch bookings", error: err.message });
  }
});




// ── 1. GET ALL REQUESTED BOOKINGS FOR A VENDOR ──
app.get("/vendor/bookings/:email", async (req, res) => {
  try {
    const { email } = req.params;

    const result = await bookingCollection.aggregate([
      {
        // Lookup the ticket details first
        $addFields: {
          ticketObjectId: { $toObjectId: "$ticketId" },
        },
      },
      {
        $lookup: {
          from: "products", // Matches your tickets collection
          localField: "ticketObjectId",
          foreignField: "_id",
          as: "ticketInfo",
        },
      },
      {
        $unwind: "$ticketInfo",
      },
      {
        // CRITICAL: Filter to only show bookings for THIS vendor's tickets
        // Assumes your ticket document contains a 'vendorEmail' or 'userEmail' field for the creator
        $match: {
          "ticketInfo.vendorEmail": email
        }
      },
      {
        $project: {
          _id: 1,
          userEmail: 1, // Buyer's email
          userName: { $ifNull: ["$userName", "Customer"] },
          quantity: 1,
          status: { $ifNull: ["$status", "pending"] },
          totalPrice: {
            $multiply: [
              { $toInt: "$quantity" },
              { $toInt: "$ticketInfo.price" }
            ],
          },
          ticketTitle: "$ticketInfo.title"
        },
      },
      {
        // Sort newest requests first
        $sort: { _id: -1 }
      }
    ]).toArray();

    res.send(result);
  } catch (err) {
    console.error("Vendor Bookings Fetch Error:", err);
    res.status(500).send({ message: "Failed to fetch requested bookings", error: err.message });
  }
});

// ── 2. PATCH UPDATE BOOKING STATUS (ACCEPT / REJECT) ──
app.patch("/bookings/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // Expects "accepted" or "rejected"

    if (!["accepted", "rejected"].includes(status?.toLowerCase())) {
      return res.status(400).send({ message: "Invalid status state assignment" });
    }

    const filter = { _id: new ObjectId(id) };
    const updateDoc = {
      $set: { status: status.toLowerCase().trim() },
    };

    const result = await bookingCollection.updateOne(filter, updateDoc);

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "Booking record not found" });
    }

    res.send({ success: true, message: `Booking successfully ${status}` });
  } catch (err) {
    console.error("Status Update Error:", err);
    res.status(500).send({ message: "Internal Server Error", error: err.message });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const {
      transactionId,
      amount,
      title,
      time,
      ticketId,
      quantity,
      userEmail,
      bookingId
    } = req.body;

    const result = await transactionCollection.insertOne({
      transactionId,
      amount,
      title,
      time,
      userEmail
    });

    const product = await productsCollection.findOne({
      _id: new ObjectId(ticketId)
    });

    if (!product) {
      return res.status(404).send({ error: "Ticket not found" });
    }

    if (product.quantity < Number(quantity)) {
      return res.status(400).send({ error: "Not enough quantity" });
    }

    const result2 = await productsCollection.updateOne(
      { _id: new ObjectId(ticketId) },
      { $set: { quantity: product.quantity - Number(quantity) } }
    );
    const result3 = await bookingCollection.updateOne({_id : new ObjectId(bookingId)} , {$set:{status:"paid"}});
    res.send({ result, result2 , result3});

  } catch (error) {
    console.log(error);
    res.status(500).send({ error: error.message });
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