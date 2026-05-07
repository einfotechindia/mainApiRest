
import axios from "axios";
import AxiosDigestAuth from "@mhoc/axios-digest-auth";
import async from "async";

exports = async function () {
  let response;
  const publicKey = "iifravbm";
  const privateKey = "5914b196-c994-49cc-8e99-b2937cf30780";
  const projectID = "66f15c0bed6e0809b67171e6";
  const clusterName = "Cluster-Test";

  const digestAuth = new AxiosDigestAuth({
    username: publicKey,
    password: privateKey,
  });

  // "SYSTEM_MEMORY_AVAILABLE" "SYSTEM_MEMORY_FREE" "SYSTEM_MEMORY_USED"
  // To understand all the attributes used in the getClusterDetails() fucntion visit official documentation - https://www.mongodb.com/docs/atlas/reference/api-resources-spec/v2/#tag/Clusters/operation/getCluster

  const getClusterDetails = async () => {
    const response = await digestAuth.request({
      headers: {
        Accept: "application/vnd.atlas.2024-05-30+json",
      },
      method: "GET",
      url:
        "https://cloud.mongodb.com/api/atlas/v2/groups/" +
        projectID +
        "/clusters/" +
        clusterName,
      maxBodyLength: Infinity,
    });
    let nodes = response?.data.connectionStrings.standard
      .split("/")[2]
      .split(",");
    let currentInstanceSize =
      response.data.replicationSpecs[0].regionConfigs[0].readOnlySpecs
        .instanceSize;
    let data = {
      nodes: nodes,
      clusterTier: currentInstanceSize,
    };
    return data;
  };

  // To understand all the attributes used in the getMetricsData(dns) fucntion visit official documentation - https://www.mongodb.com/docs/atlas/reference/api-resources-spec/v2/#tag/Monitoring-and-Logs/operation/getHostMeasurements
  const getMetricsData = async (dns) => {
    const response = await digestAuth.request({
      headers: {
        Accept: "application/vnd.atlas.2024-05-30+json",
      },
      method: "GET",
      url:
        "https://cloud.mongodb.com/api/atlas/v2/groups/" +
        projectID +
        "/processes/" +
        dns +
        "/measurements?pretty=true&granularity=PT5M&period=PT60M&m=SYSTEM_NORMALIZED_CPU_USER&m=SYSTEM_MEMORY_USED&m=SYSTEM_MEMORY_FREE&m=SYSTEM_MEMORY_AVAILABLE",
      maxBodyLength: Infinity,
    });

    console.log(JSON.stringify(response?.data?.measurements[0]), "cpu");
    console.log(JSON.stringify(response?.data?.measurements[1]), "memory");
    console.log(JSON.stringify(response?.data?.measurements), "measurments");
    let avgCPU =
      response?.data?.measurements[0]?.dataPoints.reduce((sum, item) => {
        return sum + item.value;
      }, 0) / 12;

    let avgMemory =
      response?.data?.measurements[1]?.dataPoints.reduce((sum, item) => {
        return (sum + item.value) / 1000;
      }, 0) / 12;

    let avgMemoryFree =
      response?.data?.measurements[2]?.dataPoints.reduce((sum, item) => {
        return (sum + item.value) / 1000;
      }, 0) / 12;

    let avgMemoryAvailable =
      response?.data?.measurements[3]?.dataPoints.reduce((sum, item) => {
        return (sum + item.value) / 1000;
      }, 0) / 12;

    console.log(avgMemory, "avgMemory");
    console.log(avgMemoryAvailable, "avgMemoryAvailable");
    console.log(avgMemoryFree, "avgMemoryFree");
    return avgCPU;
  };

  // To understand all the attributes used in the scaleUpDownCluster() function visit official documentation - https://www.mongodb.com/docs/atlas/reference/api-resources-spec/v2/#tag/Clusters/operation/updateCluster

  let clusterScaleUpMapping = {
    M10: "M20",
    M20: "M30",
    M30: "M40",
    M40: "M50",
    M50: "M60",
    M60: "M80",
    M80: "M140",
    M140: "M200",
    M200: "M300",
    M300: "M400",
    M400: "M700",
  };

  let clusterScaleDownMapping = {
    M20: "M10",
    M30: "M20",
    M40: "M30",
    M50: "M40",
    M60: "M50",
    M80: "M60",
    M140: "M80",
    M200: "M140",
    M300: "M200",
    M400: "M300",
    M700: "M400",
  };

  const scaleUpDownCluster = async (clusterTier, isScaleUp = false) => {
    // We created the following mapping to find lower tier clusters as compared to the existing one.

    let clusterMapping = isScaleUp
      ? clusterScaleUpMapping
      : clusterScaleDownMapping;

    console.log("New Cluster Tier = " + clusterMapping[clusterTier]);
    let data = {
      replicationSpecs: [
        {
          regionConfigs: [
            {
              electableSpecs: {
                instanceSize: clusterMapping[clusterTier],
                nodeCount: 3,
              },
              priority: 7,
              providerName: "AWS",
              regionName: "AP_SOUTH_1",
            },
          ],
        },
      ],
    };

    const response = await digestAuth.request({
      headers: {
        Accept: "application/vnd.atlas.2024-05-30+json",
      },
      method: "PATCH",
      url:
        "https://cloud.mongodb.com/api/atlas/v2/groups/" +
        projectID +
        "/clusters/" +
        clusterName,
      data: data,
      maxBodyLength: Infinity,
    });
    console.log(JSON.stringify(response.data));
  };

  // Initial Call
  const clusterDetails = await getClusterDetails(); // This line initiates the process
  let canScaleDown = true;
  let upScale = false;

  // console.log(clusterDetails.nodes); // here we check the nodes of the cluster

  let list = await Promise.all(
    clusterDetails.nodes.map(async (node) => {
      // Looping over each and every node
      return await getMetricsData(node); // Fetching metrics data for node
    })
  );

  for (listItem of list) {
    if (Math.ceil(listItem) >= 50) {
      // checking if the node has high average cpu utilisation
      console.log(Math.ceil(listItem));
      canScaleDown = false;
    }

    if (Math.ceil(listItem) >= 90) {
      // checking if the node has high average cpu utilisation
      console.log(Math.ceil(listItem));
      upScale = true;
    }
  }
  // console.log(canScaleDown) // check the output of the above function

  if (canScaleDown) {
    // checking if all the nodes has low cpu utilisation
    console.log("Initiating the cluster scale down event");
    // await scaleUpDownCluster(clusterDetails.clusterTier); // scaling down the cluster
  }

  if (upScale) {
    // checking if all the nodes has low cpu utilisation
    console.log("Initiating the cluster scale up event");
    // await scaleUpDownCluster(clusterDetails.clusterTier, true); // scaling up  the cluster
  }
};
