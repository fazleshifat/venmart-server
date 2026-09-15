require("dotenv").config();

const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

const {
    MongoClient,
    ServerApiVersion,
    ObjectId
} = require("mongodb");

const serviceAccount = require("./serviceAccountKey.json");

// ==========================================
// FIREBASE ADMIN INITIALIZATION
// ==========================================

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

// ==========================================
// EXPRESS APP
// ==========================================

const app = express();
const port = process.env.PORT || 3000;

app.use(
    cors({
        origin: true,
        credentials: true
    })
);

app.use(express.json());

// ==========================================
// MONGODB CONNECTION
// ==========================================

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.knw8z6m.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true
    }
});

// ==========================================
// HELPER FUNCTIONS
// ==========================================

const isValidObjectId = (id) => {
    return ObjectId.isValid(id);
};

const getObjectId = (id) => {
    return new ObjectId(id);
};

// ==========================================
// FIREBASE JWT MIDDLEWARE
// ==========================================

const verifyJwt = async (req, res, next) => {
    try {
        const authorization = req.headers?.authorization;

        if (!authorization) {
            return res.status(401).send({
                message: "Access denied. Authorization token required."
            });
        }

        const token = authorization.split(" ")[1];

        if (!token) {
            return res.status(401).send({
                message: "Unauthorized user."
            });
        }

        const decoded = await admin.auth().verifyIdToken(token);

        req.decodedEmail = decoded.email;

        next();

    } catch (error) {
        console.error("JWT verification failed:", error.message);

        return res.status(401).send({
            message: "Invalid or expired token."
        });
    }
};

// ==========================================
// MAIN DATABASE FUNCTION
// ==========================================

async function run() {
    try {
        await client.connect();

        await client.db("admin").command({
            ping: 1
        });

        console.log("MongoDB connected successfully.");

        const database = client.db("venmartDB");

        const usersCollection = database.collection("users");
        const allProductsCollection = database.collection("allProducts");
        const cartCollection = database.collection("cartItems");

        // ==========================================
        // BASIC SERVER ROUTE
        // ==========================================

        app.get("/", (req, res) => {
            res.send("VenMart server is running.");
        });

        // ==========================================
        // USER REGISTRATION
        // ==========================================

        app.post("/users", async (req, res) => {
            try {
                const userProfile = req.body;

                if (!userProfile?.email) {
                    return res.status(400).send({
                        message: "Email is required."
                    });
                }

                const existingUser = await usersCollection.findOne({
                    email: userProfile.email
                });

                if (existingUser) {
                    return res.status(409).send({
                        message: "User already exists."
                    });
                }

                const result = await usersCollection.insertOne({
                    ...userProfile,
                    createdAt: new Date()
                });

                res.status(201).send(result);

            } catch (error) {
                console.error("User registration error:", error);

                res.status(500).send({
                    message: "Failed to create user."
                });
            }
        });

        // ==========================================
        // GET LOGGED-IN USER PROFILE
        // ==========================================

        app.get("/users/profile/:email", verifyJwt, async (req, res) => {
            try {
                const email = req.params.email;

                if (req.decodedEmail !== email) {
                    return res.status(403).send({
                        message: "Unauthorized access."
                    });
                }

                const user = await usersCollection.findOne(
                    {
                        email
                    },
                    {
                        projection: {
                            password: 0
                        }
                    }
                );

                if (!user) {
                    return res.status(404).send({
                        message: "User profile not found."
                    });
                }

                res.send(user);

            } catch (error) {
                console.error("View profile error:", error);

                res.status(500).send({
                    message: "Failed to load profile."
                });
            }
        });

        // ==========================================
        // GET CURRENT USER PROFILE
        // Alternative route
        // ==========================================

        app.get("/users/me", verifyJwt, async (req, res) => {
            try {
                const user = await usersCollection.findOne(
                    {
                        email: req.decodedEmail
                    },
                    {
                        projection: {
                            password: 0
                        }
                    }
                );

                if (!user) {
                    return res.status(404).send({
                        message: "User profile not found."
                    });
                }

                res.send(user);

            } catch (error) {
                console.error("Get current user error:", error);

                res.status(500).send({
                    message: "Failed to load current user."
                });
            }
        });

        // ==========================================
        // UPDATE LOGGED-IN USER PROFILE
        // UPDATE NAME + PHONE + PHOTO
        // ==========================================

        app.patch("/users/profile/:email", verifyJwt, async (req, res) => {
            try {
                const email = req.params.email;
                const { name, phone, photo } = req.body;

                // Verify logged-in user
                if (req.decodedEmail !== email) {
                    return res.status(403).send({
                        message: "Unauthorized access."
                    });
                }

                const updatedFields = {};

                // Validate name
                if (typeof name === "string" && name.trim()) {
                    updatedFields.name = name.trim();
                }

                // Validate phone
                if (typeof phone === "string" && phone.trim()) {
                    const cleanPhone = phone.trim();

                    // Bangladesh phone number validation
                    const phoneRegex = /^(?:\+8801|01)[3-9]\d{8}$/;

                    if (!phoneRegex.test(cleanPhone)) {
                        return res.status(400).send({
                            message: "Invalid Bangladesh phone number."
                        });
                    }

                    updatedFields.phone = cleanPhone;
                }

                // Validate photo
                if (typeof photo === "string" && photo.trim()) {
                    updatedFields.photo = photo.trim();
                }

                // At least one valid field is required
                if (Object.keys(updatedFields).length === 0) {
                    return res.status(400).send({
                        message: "Name, phone number, or photo is required."
                    });
                }

                updatedFields.updatedAt = new Date();

                // Update MongoDB
                const result = await usersCollection.updateOne(
                    {
                        email
                    },
                    {
                        $set: updatedFields
                    }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).send({
                        message: "User profile not found."
                    });
                }

                const updatedUser = await usersCollection.findOne(
                    {
                        email
                    },
                    {
                        projection: {
                            password: 0
                        }
                    }
                );

                res.send({
                    message: "Profile information updated successfully.",
                    user: updatedUser
                });

            } catch (error) {
                console.error("Update profile error:", error);

                res.status(500).send({
                    message: "Failed to update profile information."
                });
            }
        });




        // ==========================================
        // GET CURRENT USER
        // This replaces your previous /users route
        // ==========================================

        app.get("/users", verifyJwt, async (req, res) => {
            try {
                const user = await usersCollection.findOne(
                    {
                        email: req.decodedEmail
                    },
                    {
                        projection: {
                            password: 0
                        }
                    }
                );

                if (!user) {
                    return res.status(404).send({
                        message: "User not found."
                    });
                }

                res.send(user);

            } catch (error) {
                console.error("Get user error:", error);

                res.status(500).send({
                    message: "Failed to load user."
                });
            }
        });

        // ==========================================
        // ADD PRODUCT
        // ==========================================

        app.post("/addProducts", verifyJwt, async (req, res) => {
            try {
                const email = req.query.email;

                if (!email) {
                    return res.status(400).send({
                        message: "Email is required."
                    });
                }

                if (req.decodedEmail !== email) {
                    return res.status(403).send({
                        message: "Unauthorized access."
                    });
                }

                const productsInfo = req.body;

                if (!productsInfo?.name) {
                    return res.status(400).send({
                        message: "Product name is required."
                    });
                }

                const productDocument = {
                    ...productsInfo,
                    ownerEmail: email,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                const result = await allProductsCollection.insertOne(
                    productDocument
                );

                res.status(201).send(result);

            } catch (error) {
                console.error("Add product error:", error);

                res.status(500).send({
                    message: "Failed to add product."
                });
            }
        });

        // ==========================================
        // GET ALL PRODUCTS
        // ==========================================

        app.get("/allProducts", verifyJwt, async (req, res) => {
            try {
                const email = req.query.email;

                if (!email) {
                    return res.status(400).send({
                        message: "Email is required."
                    });
                }

                if (req.decodedEmail !== email) {
                    return res.status(403).send({
                        message: "Unauthorized access."
                    });
                }

                const result = await allProductsCollection
                    .find()
                    .sort({
                        createdAt: -1
                    })
                    .toArray();

                res.send(result);

            } catch (error) {
                console.error("Get all products error:", error);

                res.status(500).send({
                    message: "Failed to load products."
                });
            }
        });

        // ==========================================
        // GET SINGLE PRODUCT
        // ==========================================

        app.get("/allProducts/:id", verifyJwt, async (req, res) => {
            try {
                const id = req.params.id;

                if (!isValidObjectId(id)) {
                    return res.status(400).send({
                        message: "Invalid product ID."
                    });
                }

                const product = await allProductsCollection.findOne({
                    _id: getObjectId(id)
                });

                if (!product) {
                    return res.status(404).send({
                        message: "Product not found."
                    });
                }

                res.send(product);

            } catch (error) {
                console.error("Get single product error:", error);

                res.status(500).send({
                    message: "Failed to load product."
                });
            }
        });

        // ==========================================
        // GET PRODUCTS BY CATEGORY
        // ==========================================

        app.get(
            "/products/:category/:email",
            verifyJwt,
            async (req, res) => {
                try {
                    const {
                        category,
                        email
                    } = req.params;

                    if (req.decodedEmail !== email) {
                        return res.status(403).send({
                            message: "Unauthorized access."
                        });
                    }

                    const result = await allProductsCollection
                        .find({
                            category
                        })
                        .sort({
                            createdAt: -1
                        })
                        .toArray();

                    res.send(result);

                } catch (error) {
                    console.error("Get category products error:", error);

                    res.status(500).send({
                        message: "Failed to load category products."
                    });
                }
            }
        );

        // ==========================================
        // UPDATE PRODUCT
        // ==========================================

        app.put(
            "/allProducts/:id/:email",
            verifyJwt,
            async (req, res) => {
                try {
                    const {
                        id,
                        email
                    } = req.params;

                    if (req.decodedEmail !== email) {
                        return res.status(403).send({
                            message: "Unauthorized access."
                        });
                    }

                    if (!isValidObjectId(id)) {
                        return res.status(400).send({
                            message: "Invalid product ID."
                        });
                    }

                    const product = await allProductsCollection.findOne({
                        _id: getObjectId(id)
                    });

                    if (!product) {
                        return res.status(404).send({
                            message: "Product not found."
                        });
                    }

                    if (
                        product.ownerEmail &&
                        product.ownerEmail !== email
                    ) {
                        return res.status(403).send({
                            message: "You can only update your own product."
                        });
                    }

                    const updatedProduct = {
                        ...req.body,
                        updatedAt: new Date()
                    };

                    delete updatedProduct._id;
                    delete updatedProduct.ownerEmail;

                    const result = await allProductsCollection.updateOne(
                        {
                            _id: getObjectId(id)
                        },
                        {
                            $set: updatedProduct
                        }
                    );

                    res.send(result);

                } catch (error) {
                    console.error("Update product error:", error);

                    res.status(500).send({
                        message: "Failed to update product."
                    });
                }
            }
        );

        // ==========================================
        // DECREASE PRODUCT QUANTITY
        // Used after cancelling or purchasing
        // ==========================================

        app.patch(
            "/allProducts/:id/:email",
            verifyJwt,
            async (req, res) => {
                try {
                    const {
                        id,
                        email
                    } = req.params;

                    if (req.decodedEmail !== email) {
                        return res.status(403).send({
                            message: "Unauthorized access."
                        });
                    }

                    if (!isValidObjectId(id)) {
                        return res.status(400).send({
                            message: "Invalid product ID."
                        });
                    }

                    const quantity = Number(req.body?.quantity);

                    if (!Number.isFinite(quantity) || quantity <= 0) {
                        return res.status(400).send({
                            message: "Valid quantity is required."
                        });
                    }

                    const result = await allProductsCollection.updateOne(
                        {
                            _id: getObjectId(id)
                        },
                        {
                            $inc: {
                                mainQty: -quantity
                            }
                        }
                    );

                    res.send(result);

                } catch (error) {
                    console.error("Decrease product quantity error:", error);

                    res.status(500).send({
                        message: "Failed to decrease product quantity."
                    });
                }
            }
        );

        // ==========================================
        // ADD PRODUCT TO CART
        // ==========================================

        app.post("/products/cart", verifyJwt, async (req, res) => {
            try {
                const email = req.query.email;

                if (!email) {
                    return res.status(400).send({
                        message: "Email is required."
                    });
                }

                if (req.decodedEmail !== email) {
                    return res.status(403).send({
                        message: "Unauthorized access."
                    });
                }

                const cartProduct = {
                    ...req.body,
                    userEmail: email,
                    createdAt: new Date()
                };

                const result = await cartCollection.insertOne(
                    cartProduct
                );

                res.status(201).send(result);

            } catch (error) {
                console.error("Add to cart error:", error);

                res.status(500).send({
                    message: "Failed to add product to cart."
                });
            }
        });

        // ==========================================
        // DECREASE PRODUCT QUANTITY WHILE PURCHASE
        // ==========================================

        app.patch(
            "/cart/:id/:email",
            verifyJwt,
            async (req, res) => {
                try {
                    const {
                        id,
                        email
                    } = req.params;

                    if (req.decodedEmail !== email) {
                        return res.status(403).send({
                            message: "Unauthorized access."
                        });
                    }

                    if (!isValidObjectId(id)) {
                        return res.status(400).send({
                            message: "Invalid product ID."
                        });
                    }

                    const quantity = Number(req.body?.quantity);

                    if (!Number.isFinite(quantity) || quantity <= 0) {
                        return res.status(400).send({
                            message: "Valid quantity is required."
                        });
                    }

                    const result = await allProductsCollection.updateOne(
                        {
                            _id: getObjectId(id)
                        },
                        {
                            $inc: {
                                mainQty: -quantity
                            }
                        }
                    );

                    res.send(result);

                } catch (error) {
                    console.error("Purchase quantity update error:", error);

                    res.status(500).send({
                        message: "Failed to update product quantity."
                    });
                }
            }
        );

        // ==========================================
        // GET CART ITEMS
        // ==========================================

        app.get("/cart", verifyJwt, async (req, res) => {
            try {
                const email = req.query.email;

                if (!email) {
                    return res.status(400).send({
                        message: "Email is required."
                    });
                }

                if (req.decodedEmail !== email) {
                    return res.status(403).send({
                        message: "Unauthorized access."
                    });
                }

                const result = await cartCollection
                    .find({
                        userEmail: email
                    })
                    .sort({
                        createdAt: -1
                    })
                    .toArray();

                res.send(result);

            } catch (error) {
                console.error("Get cart error:", error);

                res.status(500).send({
                    message: "Failed to load cart."
                });
            }
        });

        // ==========================================
        // GET SINGLE CART ITEM
        // ==========================================

        app.get("/cart/:id", verifyJwt, async (req, res) => {
            try {
                const email = req.query.email;
                const id = req.params.id;

                if (!email) {
                    return res.status(400).send({
                        message: "Email is required."
                    });
                }

                if (req.decodedEmail !== email) {
                    return res.status(403).send({
                        message: "Unauthorized access."
                    });
                }

                if (!isValidObjectId(id)) {
                    return res.status(400).send({
                        message: "Invalid cart item ID."
                    });
                }

                const result = await cartCollection.findOne({
                    _id: getObjectId(id),
                    userEmail: email
                });

                if (!result) {
                    return res.status(404).send({
                        message: "Cart item not found."
                    });
                }

                res.send(result);

            } catch (error) {
                console.error("Get single cart item error:", error);

                res.status(500).send({
                    message: "Failed to load cart item."
                });
            }
        });

        // ==========================================
        // DELETE CART ITEM
        // ==========================================

        app.delete(
            "/cart/delete/:id/:email",
            verifyJwt,
            async (req, res) => {
                try {
                    const {
                        id,
                        email
                    } = req.params;

                    if (req.decodedEmail !== email) {
                        return res.status(403).send({
                            message: "Unauthorized access."
                        });
                    }

                    if (!isValidObjectId(id)) {
                        return res.status(400).send({
                            message: "Invalid cart item ID."
                        });
                    }

                    const result = await cartCollection.deleteOne({
                        _id: getObjectId(id),
                        userEmail: email
                    });

                    if (result.deletedCount === 0) {
                        return res.status(404).send({
                            message: "Cart item not found."
                        });
                    }

                    res.send(result);

                } catch (error) {
                    console.error("Delete cart item error:", error);

                    res.status(500).send({
                        message: "Failed to delete cart item."
                    });
                }
            }
        );

        // ==========================================
        // DELETE MY PRODUCT
        // ==========================================

        app.delete(
            "/myProduct/delete/:id/:email",
            verifyJwt,
            async (req, res) => {
                try {
                    const {
                        id,
                        email
                    } = req.params;

                    if (req.decodedEmail !== email) {
                        return res.status(403).send({
                            message: "Unauthorized access."
                        });
                    }

                    if (!isValidObjectId(id)) {
                        return res.status(400).send({
                            message: "Invalid product ID."
                        });
                    }

                    const product = await allProductsCollection.findOne({
                        _id: getObjectId(id)
                    });

                    if (!product) {
                        return res.status(404).send({
                            message: "Product not found."
                        });
                    }

                    if (
                        product.ownerEmail &&
                        product.ownerEmail !== email
                    ) {
                        return res.status(403).send({
                            message: "You can only delete your own product."
                        });
                    }

                    const result = await allProductsCollection.deleteOne({
                        _id: getObjectId(id)
                    });

                    res.send(result);

                } catch (error) {
                    console.error("Delete product error:", error);

                    res.status(500).send({
                        message: "Failed to delete product."
                    });
                }
            }
        );

        console.log("VenMart API routes initialized.");

    } catch (error) {
        console.error("MongoDB connection failed:", error);
    }
}

run();

// ==========================================
// START SERVER
// ==========================================

app.listen(port, () => {
    console.log(`VenMart server is running on port ${port}`);
});