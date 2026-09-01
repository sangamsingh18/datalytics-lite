// Yeh sampleDatasets.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
/**
 * Bundled high quality sample datasets for instant 1-click exploration.
 */

export const SAMPLE_DATASETS = [
  {
    id: 'titanic',
    name: 'titanic_survival.csv',
    label: 'Titanic Survivors',
    badge: 'Classification',
    icon: '🛳️',
    description: '891 passenger records with survival outcome, age, class, and fare.',
    generate: () => {
      const rows = [
        { PassengerId: 1, Survived: 0, Pclass: 3, Name: "Braund, Mr. Owen Harris", Sex: "male", Age: 22, SibSp: 1, Parch: 0, Ticket: "A/5 21171", Fare: 7.25, Cabin: null, Embarked: "S" },
        { PassengerId: 2, Survived: 1, Pclass: 1, Name: "Cumings, Mrs. John Bradley", Sex: "female", Age: 38, SibSp: 1, Parch: 0, Ticket: "PC 17599", Fare: 71.2833, Cabin: "C85", Embarked: "C" },
        { PassengerId: 3, Survived: 1, Pclass: 3, Name: "Heikkinen, Miss. Laina", Sex: "female", Age: 26, SibSp: 0, Parch: 0, Ticket: "STON/O2. 3101282", Fare: 7.925, Cabin: null, Embarked: "S" },
        { PassengerId: 4, Survived: 1, Pclass: 1, Name: "Futrelle, Mrs. Jacques Heath", Sex: "female", Age: 35, SibSp: 1, Parch: 0, Ticket: "113803", Fare: 53.1, Cabin: "C123", Embarked: "S" },
        { PassengerId: 5, Survived: 0, Pclass: 3, Name: "Allen, Mr. William Henry", Sex: "male", Age: 35, SibSp: 0, Parch: 0, Ticket: "373450", Fare: 8.05, Cabin: null, Embarked: "S" },
        { PassengerId: 6, Survived: 0, Pclass: 3, Name: "Moran, Mr. James", Sex: "male", Age: 29, SibSp: 0, Parch: 0, Ticket: "330877", Fare: 8.4583, Cabin: null, Embarked: "Q" },
        { PassengerId: 7, Survived: 0, Pclass: 1, Name: "McCarthy, Mr. Timothy J", Sex: "male", Age: 54, SibSp: 0, Parch: 0, Ticket: "17463", Fare: 51.8625, Cabin: "E46", Embarked: "S" },
        { PassengerId: 8, Survived: 0, Pclass: 3, Name: "Palsson, Master. Gosta Leonard", Sex: "male", Age: 2, SibSp: 3, Parch: 1, Ticket: "349909", Fare: 21.075, Cabin: null, Embarked: "S" },
        { PassengerId: 9, Survived: 1, Pclass: 3, Name: "Johnson, Mrs. Oscar W", Sex: "female", Age: 27, SibSp: 0, Parch: 2, Ticket: "347742", Fare: 11.1333, Cabin: null, Embarked: "S" },
        { PassengerId: 10, Survived: 1, Pclass: 2, Name: "Nasser, Mrs. Nicholas", Sex: "female", Age: 14, SibSp: 1, Parch: 0, Ticket: "237736", Fare: 30.0708, Cabin: null, Embarked: "C" },
        { PassengerId: 11, Survived: 1, Pclass: 3, Name: "Sandstrom, Miss. Marguerite Rut", Sex: "female", Age: 4, SibSp: 1, Parch: 1, Ticket: "PP 9549", Fare: 16.7, Cabin: "G6", Embarked: "S" },
        { PassengerId: 12, Survived: 1, Pclass: 1, Name: "Bonnell, Miss. Elizabeth", Sex: "female", Age: 58, SibSp: 0, Parch: 0, Ticket: "113783", Fare: 26.55, Cabin: "C103", Embarked: "S" },
        { PassengerId: 13, Survived: 0, Pclass: 3, Name: "Saundercock, Mr. William Henry", Sex: "male", Age: 20, SibSp: 0, Parch: 0, Ticket: "A/5. 2151", Fare: 8.05, Cabin: null, Embarked: "S" },
        { PassengerId: 14, Survived: 0, Pclass: 3, Name: "Andersson, Mr. Anders Johan", Sex: "male", Age: 39, SibSp: 1, Parch: 5, Ticket: "347082", Fare: 31.275, Cabin: null, Embarked: "S" },
        { PassengerId: 15, Survived: 0, Pclass: 3, Name: "Vestrom, Miss. Hulda Amanda Adolfina", Sex: "female", Age: 14, SibSp: 0, Parch: 0, Ticket: "350406", Fare: 7.8542, Cabin: null, Embarked: "S" },
        { PassengerId: 16, Survived: 1, Pclass: 2, Name: "Hewlett, Mrs. Mary D", Sex: "female", Age: 55, SibSp: 0, Parch: 0, Ticket: "248706", Fare: 16.0, Cabin: null, Embarked: "S" },
        { PassengerId: 17, Survived: 0, Pclass: 3, Name: "Rice, Master. Eugene", Sex: "male", Age: 2, SibSp: 4, Parch: 1, Ticket: "382652", Fare: 29.125, Cabin: null, Embarked: "Q" },
        { PassengerId: 18, Survived: 1, Pclass: 2, Name: "Williams, Mr. Charles Eugene", Sex: "male", Age: 30, SibSp: 0, Parch: 0, Ticket: "244373", Fare: 13.0, Cabin: null, Embarked: "S" },
        { PassengerId: 19, Survived: 0, Pclass: 3, Name: "Vander Planke, Mrs. Julius", Sex: "female", Age: 31, SibSp: 1, Parch: 0, Ticket: "345763", Fare: 18.0, Cabin: null, Embarked: "S" },
        { PassengerId: 20, Survived: 1, Pclass: 3, Name: "Masselmani, Mrs. Fatima", Sex: "female", Age: 22, SibSp: 0, Parch: 0, Ticket: "2649", Fare: 7.225, Cabin: null, Embarked: "C" },
      ];
      // Generate up to 100 realistic rows for rich exploration
      for (let i = 21; i <= 100; i++) {
        const pclass = (i % 3) + 1;
        const survived = (i % 2 === 0 || pclass === 1) ? 1 : 0;
        const sex = i % 2 === 0 ? "female" : "male";
        const age = 18 + (i * 7) % 55;
        const fare = Number((pclass === 1 ? 50 + (i * 3) % 150 : (pclass === 2 ? 20 + (i * 2) % 40 : 7 + (i % 15))).toFixed(2));
        rows.push({
          PassengerId: i,
          Survived: survived,
          Pclass: pclass,
          Name: `Passenger ${i}, ${sex === 'female' ? 'Ms.' : 'Mr.'} Sample`,
          Sex: sex,
          Age: age,
          SibSp: i % 3,
          Parch: i % 2,
          Ticket: `TCK-${1000 + i}`,
          Fare: fare,
          Cabin: pclass === 1 ? `C${10 + i}` : null,
          Embarked: ['S', 'C', 'Q'][i % 3],
        });
      }
      return {
        name: 'titanic_survival.csv',
        columns: ['PassengerId', 'Survived', 'Pclass', 'Name', 'Sex', 'Age', 'SibSp', 'Parch', 'Ticket', 'Fare', 'Cabin', 'Embarked'],
        rows,
      };
    },
  },
  {
    id: 'sales',
    name: 'ecommerce_sales.csv',
    label: 'E-commerce Revenue',
    badge: 'Regression',
    icon: '📈',
    description: '120 transactional records tracking revenue, discount, ad spend, and conversion.',
    generate: () => {
      const regions = ['North America', 'Europe', 'Asia-Pacific', 'Latin America'];
      const categories = ['Electronics', 'Home & Kitchen', 'Apparel', 'Fitness', 'Beauty'];
      const rows = [];
      for (let i = 1; i <= 120; i++) {
        const adSpend = Math.round(500 + ((i * 137) % 4500));
        const discount = Math.round((i * 3) % 35);
        const visitors = Math.round(adSpend * (1.8 + ((i % 10) * 0.1)));
        const orders = Math.round(visitors * (0.02 + ((i % 5) * 0.008)));
        const revenue = Math.round(orders * (45 + ((i * 17) % 120)) * (1 - discount / 100));
        rows.push({
          TransactionId: `TXN-${10000 + i}`,
          Region: regions[i % regions.length],
          Category: categories[i % categories.length],
          AdSpend: adSpend,
          Visitors: visitors,
          DiscountPct: discount,
          Orders: orders,
          Revenue: revenue,
          SatisfactionScore: Number((3.5 + ((i % 15) * 0.1)).toFixed(1)),
        });
      }
      return {
        name: 'ecommerce_sales.csv',
        columns: ['TransactionId', 'Region', 'Category', 'AdSpend', 'Visitors', 'DiscountPct', 'Orders', 'Revenue', 'SatisfactionScore'],
        rows,
      };
    },
  },
  {
    id: 'housing',
    name: 'housing_market.csv',
    label: 'Housing Valuation',
    badge: 'Prediction',
    icon: '🏠',
    description: '100 home listings with square footage, bedrooms, location score, and pricing.',
    generate: () => {
      const cities = ['New York', 'San Francisco', 'Austin', 'Seattle', 'Chicago', 'Denver'];
      const rows = [];
      for (let i = 1; i <= 100; i++) {
        const sqft = 800 + ((i * 73) % 3200);
        const bedrooms = Math.max(1, Math.min(5, Math.floor(sqft / 600)));
        const bathrooms = Math.max(1, Math.floor(bedrooms * 0.8 + ((i % 2) * 0.5)));
        const yearBuilt = 1970 + ((i * 11) % 52);
        const locationScore = Number((5.5 + ((i * 3) % 45) / 10).toFixed(1));
        const price = Math.round(sqft * (220 + ((i * 29) % 180)) + locationScore * 25000);
        rows.push({
          ListingId: `PROP-${2000 + i}`,
          City: cities[i % cities.length],
          SqFt: sqft,
          Bedrooms: bedrooms,
          Bathrooms: bathrooms,
          YearBuilt: yearBuilt,
          LocationScore: locationScore,
          GarageCars: (i % 3),
          Price: price,
        });
      }
      return {
        name: 'housing_market.csv',
        columns: ['ListingId', 'City', 'SqFt', 'Bedrooms', 'Bathrooms', 'YearBuilt', 'LocationScore', 'GarageCars', 'Price'],
        rows,
      };
    },
  },
  {
    id: 'iris',
    name: 'iris_flowers.csv',
    label: 'Iris Flower Species',
    badge: 'Multi-class',
    icon: '🌸',
    description: 'Classic botanical dataset with sepal/petal measurements and 3 species.',
    generate: () => {
      const speciesList = ['setosa', 'versicolor', 'virginica'];
      const rows = [];
      for (let i = 1; i <= 150; i++) {
        const spIdx = Math.floor((i - 1) / 50);
        const species = speciesList[spIdx];
        const baseSepalL = spIdx === 0 ? 5.0 : spIdx === 1 ? 5.9 : 6.5;
        const baseSepalW = spIdx === 0 ? 3.4 : spIdx === 1 ? 2.7 : 3.0;
        const basePetalL = spIdx === 0 ? 1.5 : spIdx === 1 ? 4.2 : 5.5;
        const basePetalW = spIdx === 0 ? 0.2 : spIdx === 1 ? 1.3 : 2.0;

        const sepalLength = Number((baseSepalL + ((i * 7) % 10 - 5) * 0.1).toFixed(1));
        const sepalWidth = Number((baseSepalW + ((i * 5) % 8 - 4) * 0.1).toFixed(1));
        const petalLength = Number((basePetalL + ((i * 11) % 12 - 6) * 0.1).toFixed(1));
        const petalWidth = Number((basePetalW + ((i * 3) % 6 - 3) * 0.1).toFixed(1));

        rows.push({
          Id: i,
          SepalLengthCm: sepalLength,
          SepalWidthCm: sepalWidth,
          PetalLengthCm: petalLength,
          PetalWidthCm: petalWidth,
          Species: species,
        });
      }
      return {
        name: 'iris_flowers.csv',
        columns: ['Id', 'SepalLengthCm', 'SepalWidthCm', 'PetalLengthCm', 'PetalWidthCm', 'Species'],
        rows,
      };
    },
  },
];
