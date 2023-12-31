#   SPDX-License-Identifier: AGPL-3.0-only
#   -*- coding: utf-8 -*-
#
#   This file is part of SKALE IMA.
#
#   Copyright (C) 2019-Present SKALE Labs
#
#   SKALE IMA is free software: you can redistribute it and/or modify
#   it under the terms of the GNU Affero General Public License as published by
#   the Free Software Foundation, either version 3 of the License, or
#   (at your option) any later version.
#
#   SKALE IMA is distributed in the hope that it will be useful,
#   but WITHOUT ANY WARRANTY; without even the implied warranty of
#   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#   GNU Affero General Public License for more details.
#
#   You should have received a copy of the GNU Affero General Public License
#   along with SKALE IMA.  If not, see <https://www.gnu.org/licenses/>.

class Config:
    src_root = '.'
    agent_src = 'src'
    proxy_root = 'IMA/proxy'
    test_root = 'test'
    test_working_dir = 'working'
    test_resource_dir = 'resources'
    network_for_mainnet = 'mainnet'
    network_for_schain = 'schain'
    mainnet_key='0x81c26527399eb89edc444159889bcf42f8f425522ec2e6e65b1468ad84312524'
    mainnet_rpc_url='http://127.0.0.1:8545'
    schain_key = '0x9a862326bb0e585db6dedc8cba43877124b0acc6556764b246f3298a71dbc241'
    schain_rpc_url = 'http://127.0.0.1:8545'
    schain_name = 'd2'
    schain_name_2 = 'd3'
    abi_mainnet = 'proxyMainnet.json'
    abi_schain = 'proxySchain_'
    abi_schain_2 = 'proxySchain_'
    user_key = ''

    def __init__(self, src_root, config_json):
        self.agent_src = src_root + '/' + self.agent_src
        self.proxy_root = src_root + '/' + self.proxy_root
        self.agent_root = src_root + '/src'
        self.test_root = src_root + '/' + self.test_root
        self.test_working_dir = self.test_root + '/' + self.test_working_dir
        self.test_resource_dir = self.test_root + '/' + self.test_resource_dir

        if 'NETWORK_FOR_ETHEREUM' in config_json:
            self.network_for_mainnet = config_json['NETWORK_FOR_ETHEREUM']
        if 'NETWORK_FOR_SCHAIN' in config_json:
            self.network_for_schain = config_json['NETWORK_FOR_SCHAIN']
        self.mainnet_key = config_json['PRIVATE_KEY_FOR_ETHEREUM']
        if 'URL_W3_ETHEREUM' in config_json:
            self.mainnet_rpc_url = config_json['URL_W3_ETHEREUM']
        self.schain_key = config_json['PRIVATE_KEY_FOR_SCHAIN']
        if 'URL_W3_S_CHAIN' in config_json:
            self.schain_rpc_url = config_json['URL_W3_S_CHAIN']
        if 'CHAIN_NAME_SCHAIN' in config_json:
            self.schain_name = config_json['CHAIN_NAME_SCHAIN']
        if 'user_key' in config_json:
            self.user_key = config_json['user_key']

        self.abi_mainnet = self.proxy_root + '/data/' + self.abi_mainnet
        self.abi_schain = self.proxy_root + '/data/' + self.abi_schain + self.schain_name + '.json'
        self.abi_schain_2 = self.proxy_root + '/data/' + self.abi_schain_2 + self.schain_name_2 + '.json'


