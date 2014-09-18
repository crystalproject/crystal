/* -*- Mode:C++; c-file-style:"gnu"; indent-tabs-mode:nil; -*- */
/*
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 2 as
 * published by the Free Software Foundation;
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA  02111-1307  USA
 */

//
// This is an illustration of how one could use virtualization techniques to
// allow running applications on virtual machines talking over simulated
// networks.
//

#include <iostream>
#include <fstream>
#include <signal.h>

#include "ns3/core-module.h"
#include "ns3/network-module.h"
#include "ns3/csma-module.h"
#include "ns3/tap-bridge-module.h"
using namespace ns3;

NS_LOG_COMPONENT_DEFINE ("TapCsmaVirtualMachineExample");

void terminate (int sig) {
  Simulator::Stop();
  Simulator::Destroy();
}

int 
main (int argc, char *argv[])
{
  std::string tap0Name ("ns3-contap0");
  std::string tap1Name ("ns3-contap1");

  CommandLine cmd;
  cmd.AddValue("tap0DeviceName", "Tap 0 device name", tap0Name);
  cmd.AddValue("tap1DeviceName", "Tap 1 device name", tap1Name);
  
  cmd.Parse (argc, argv);

  //
  // We are interacting with the outside, real, world.  This means we have to 
  // interact in real-time and therefore means we have to use the real-time
  // simulator and take the time to calculate checksums.
  //
  GlobalValue::Bind ("SimulatorImplementationType", StringValue ("ns3::RealtimeSimulatorImpl"));
  GlobalValue::Bind ("ChecksumEnabled", BooleanValue (true));

  //
  // sighandler for terminating simulation
  //
  struct sigaction sigIntHandler;

  sigIntHandler.sa_handler = terminate;
  sigemptyset(&sigIntHandler.sa_mask);
  sigIntHandler.sa_flags = 0;

  sigaction(SIGINT, &sigIntHandler, NULL);

  //
  // Create two ghost nodes.
  //
  NodeContainer nodes;
  nodes.Create (2);

  //
  // Use a CsmaHelper to get a CSMA channel created, and the needed net 
  // devices installed on both of the nodes.  The data rate and delay for the
  // channel can be set through the command-line parser.  For example,
  //
  // ./waf --run "tap=csma-virtual-machine --ns3::CsmaChannel::DataRate=10000000"
  //
  CsmaHelper csma;
  NetDeviceContainer devices = csma.Install (nodes);

  TapBridgeHelper tapBridge;
  tapBridge.SetAttribute ("Mode", StringValue ("UseBridge"));
  tapBridge.SetAttribute ("DeviceName", StringValue (tap0Name));
  tapBridge.Install (nodes.Get (0), devices.Get (0));


  tapBridge.SetAttribute ("DeviceName", StringValue (tap1Name));
  tapBridge.Install (nodes.Get (1), devices.Get (1));

  //
  // Run the simulation for ten minutes to give the user time to play around
  //
  //Simulator::Stop (Seconds (120.));
  csma.EnablePcapAll ("ssh1.pcap");
  Simulator::Run ();
  //Simulator::Destroy ();
}
