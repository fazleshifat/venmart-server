require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({
    origin: "http://localhost:5173",
    credentials: true
}));
app.use(express.json());

// venmart_admin
// EOzNqDj97GNfUGz7


const uri = "mongodb+srv://venmart_admin:EOzNqDj97GNfUGz7@cluster0.knw8z6m.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();



        // create database and inserting data
        const usersCollection = client.db("venmartDB").collection("users");
        const allProductsCollection = client.db("venmartDB").collection("allProducts");
        // const groupsCollection = client.db("hobbins").collection("groups");

        // user related crud
        app.post('/users', async (req, res) => {
            console.log("Received body:", req.body);  // Add this line
            const userProfile = req.body;
            const result = await usersCollection.insertOne(userProfile);
            res.send(result);
        })

        app.get('/users', async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);

        })

        // product related api
        app.post('/allProducts', async (req, res) => {
            const productsInfo = req.body;
            const result = await allProductsCollection.insertOne(productsInfo);
            res.send(result);

        })

        app.get('/allProducts', async (req, res) => {
            const result = await allProductsCollection.find().toArray();
            res.send(result);
        })

        app.get('/products/:category', async (req, res) => {
            const category = req.params.category;
            const query = { category: category };
            const result = await allProductsCollection.find(query).toArray();
            res.send(result);
        })

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}

run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Venmart is ongoing')
})

app.listen(port, () => {
    console.log(`Venmart server is running on port ${port}`)
})